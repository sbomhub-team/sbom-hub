import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { v4 as uuidv4 } from 'uuid'
import * as k8s from '@kubernetes/client-node'
import mongoose from 'mongoose'
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

dotenv.config()

const WORKSPACE_DIR = process.env.SBOM_WORKSPACE_DIR || '/tmp/sbom-workspace'
const K8S_NAMESPACE = process.env.K8S_NAMESPACE || 'sbom'
const SCANNER_IMAGE = process.env.SCANNER_IMAGE || 'sbom-scanner:latest'
const WORKSPACE_PVC_NAME = process.env.WORKSPACE_PVC_NAME || 'sbom-workspace-pvc'
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000'
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || 200)
const BODY_LIMIT = `${MAX_UPLOAD_MB}mb`
const FORBIDDEN_LICENSES = parseLicenseList(process.env.FORBIDDEN_LICENSES || 'GPL-3.0-only,GPL-3.0,GPL-2.0-only,AGPL-3.0-only,AGPL-3.0')
const RESTRICTED_LICENSES = parseLicenseList(process.env.RESTRICTED_LICENSES || 'LGPL-2.1-only,LGPL-3.0-only,MPL-2.0,CC-BY-SA-4.0')
const ENABLE_OSV_ANALYSIS = process.env.ENABLE_OSV_ANALYSIS !== 'false'
const OSV_ANALYSIS_MAX_PACKAGES = Number(process.env.OSV_ANALYSIS_MAX_PACKAGES || 200)
const REPORT_ANSI_COLORS = process.env.REPORT_ANSI_COLORS !== 'false'

const app = express()
const PORT = process.env.PORT || 3001
const USE_K8S = process.env.USE_K8S !== 'false'
const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017/sbom'

const corsOrigins = Array.from(new Set([
    FRONTEND_URL,
    'http://localhost:3000',
    'http://127.0.0.1:3000'
]))

// Middleware
app.use(cors({ origin: corsOrigins }))
app.use(express.json({ limit: BODY_LIMIT }))
app.use(express.urlencoded({ limit: BODY_LIMIT, extended: true }))

const userSchema = new mongoose.Schema(
    {
        email: { type: String, required: true, unique: true, lowercase: true, trim: true },
        password: { type: String, required: true },
        name: { type: String, required: true },
        createdAt: { type: Date, default: Date.now }
    },
    { versionKey: false }
)

const sbomJobSchema = new mongoose.Schema(
    {
        jobId: { type: String, required: true, unique: true },
        type: { type: String, required: true },
        source: { type: String, required: true },
        status: { type: String, required: true },
        sbom: { type: Object, default: null },
        analysis: { type: Object, default: null },
        analysisText: { type: String, default: null },
        createdAt: { type: Date, default: Date.now }
    },
    { versionKey: false }
)

const User = mongoose.model('User', userSchema)
const SbomJob = mongoose.model('SbomJob', sbomJobSchema)

// Initialize Kubernetes client
let kc
let batchApi

if (USE_K8S) {
    try {
        kc = new k8s.KubeConfig()
        let k8sReady = false

        // Try to load from cluster (in-pod)
        try {
            kc.loadFromCluster()
            console.log('✅ Using in-cluster Kubernetes config')
            k8sReady = true
        } catch (e) {
            console.log('ℹ️  Not running in cluster, trying local kubeconfig...')

            // Fall back to kubeconfig file
            try {
                kc.loadFromDefault()
                console.log('✅ Using local kubeconfig')
                k8sReady = true
            } catch (e2) {
                console.log('ℹ️  No local kubeconfig found, using local Docker mode')
                k8sReady = false
            }
        }

        if (k8sReady) {
            batchApi = kc.makeApiClient(k8s.BatchV1Api)
            console.log('✅ Kubernetes client initialized')
        } else {
            batchApi = null
            console.log('ℹ️  Kubernetes client disabled - using local Docker SBOM generation')
        }
    } catch (error) {
        console.warn('⚠️  Kubernetes client initialization failed:', error.message)
        console.log('   Using local Docker SBOM generation.')
        batchApi = null
    }
} else {
    batchApi = null
    console.log('ℹ️  Kubernetes disabled by USE_K8S=false - using local Docker SBOM generation')
}

// ============================================================
// HEALTH CHECK ENDPOINT
// ============================================================
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        kubernetes: batchApi ? 'ready' : 'unavailable',
        mongodb: mongoose.connection.readyState === 1 ? 'ready' : 'unavailable'
    })
})

// ============================================================
// AUTHENTICATION ENDPOINTS
// ============================================================

// Signup
app.post('/api/auth/signup', async (req, res) => {
    try {
        const { email, password, name } = req.body

        if (!email || !password || !name) {
            return res.status(400).json({
                success: false,
                message: 'Email, password, and name are required'
            })
        }

        const existingUser = await User.findOne({ email })
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'Email already registered'
            })
        }

        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 6 characters'
            })
        }

        const user = await User.create({ email, password, name })

        res.json({
            success: true,
            message: 'Account created successfully',
            user: { id: user._id.toString(), email: user.email, name: user.name }
        })
    } catch (error) {
        res.status(500).json({ success: false, message: error.message })
    }
})

// Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email and password are required'
            })
        }

        const user = await User.findOne({ email })

        if (!user || user.password !== password) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            })
        }

        res.json({
            success: true,
            user: {
                id: user._id.toString(),
                email: user.email,
                name: user.name
            },
            token: 'backend-token-' + Date.now()
        })
    } catch (error) {
        res.status(500).json({ success: false, message: error.message })
    }
})

// ============================================================
// SBOM GENERATION ENDPOINTS
// ============================================================

// Generate SBOM from GitHub URL
app.post('/api/sbom/github', async (req, res) => {
    try {
        const { githubUrl } = req.body
        const jobId = uuidv4()

        if (!githubUrl) {
            return res.status(400).json({
                success: false,
                message: 'GitHub URL is required'
            })
        }

        // Validate GitHub URL
        const githubRegex = /^https?:\/\/(www\.)?github\.com\/[\w-]+\/[\w-]+\/?$/
        if (!githubRegex.test(githubUrl)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid GitHub URL format'
            })
        }

        console.log(`📦 Creating SBOM generation job for GitHub URL: ${githubUrl}`)

        let useK8s = false
        if (batchApi) {
            // Try to create Kubernetes Job
            try {
                ensureJobWorkspace(jobId)
                await createK8sJobForGitHub(jobId, githubUrl)
                useK8s = true
                await SbomJob.create({
                    jobId,
                    type: 'github',
                    source: githubUrl,
                    status: 'pending',
                    sbom: null,
                    createdAt: new Date()
                })

                res.json({
                    success: true,
                    jobId,
                    message: 'SBOM generation job created in Kubernetes',
                    status: 'pending'
                })
            } catch (k8sError) {
                console.warn('⚠️  Kubernetes job creation failed, falling back to local Docker mode:', k8sError.message)
                // Fall through to local Docker mode
            }
        }



        if (!useK8s) {
            // Local Docker mode - generate SBOM using Docker + Syft
            const sbomData = await generateRealSBOMFromGitHub(jobId, githubUrl)
            const { analysis, analysisText } = await buildJobAnalysis({ jobId, type: 'github', source: githubUrl, sbom: sbomData })
            await SbomJob.create({
                jobId,
                type: 'github',
                source: githubUrl,
                status: 'completed',
                sbom: sbomData,
                analysis,
                analysisText,
                createdAt: new Date()
            })

            res.json({
                success: true,
                jobId,
                message: 'SBOM generated successfully',
                status: 'completed',
                sbom: sbomData,
                analysis,
                reportDownloadPath: `/api/sbom/job/${jobId}/report.txt`
            })
        }
    } catch (error) {
        console.error('Error creating GitHub SBOM job:', error)
        res.status(500).json({ success: false, message: error.message })
    }
})
// Generate SBOM from ZIP file upload
app.post('/api/sbom/upload', async (req, res) => {
    try {
        const { fileName, fileSize, fileContent } = req.body
        const jobId = uuidv4()

        if (!fileName) {
            return res.status(400).json({
                success: false,
                message: 'File name is required'
            })
        }

        if (!fileName.endsWith('.zip')) {
            return res.status(400).json({
                success: false,
                message: 'Only ZIP files are supported'
            })
        }

        console.log(`📦 Creating SBOM generation job for file upload: ${fileName}`)

        let useK8s = false
        if (batchApi) {
            // Try to create Kubernetes Job
            try {
                const safeFileName = sanitizeFileName(fileName)
                const { inputDir } = ensureJobWorkspace(jobId)
                const zipPath = path.join(inputDir, safeFileName)
                const zipPathInJob = `/workspace/input/${safeFileName}`
                const buffer = Buffer.from(fileContent, 'base64')
                fs.writeFileSync(zipPath, buffer)

                await createK8sJobForFile(jobId, safeFileName, zipPathInJob)
                useK8s = true
                await SbomJob.create({
                    jobId,
                    type: 'file',
                    source: fileName,
                    status: 'pending',
                    sbom: null,
                    createdAt: new Date()
                })

                res.json({
                    success: true,
                    jobId,
                    message: 'SBOM generation job created in Kubernetes',
                    status: 'pending'
                })
            } catch (k8sError) {
                console.warn('⚠️  Kubernetes job creation failed, falling back to local Docker mode:', k8sError.message)
                // Fall through to local Docker mode
            }
        }

        if (!useK8s) {
            // Local Docker mode - generate SBOM using Docker + Syft
            const sbomData = await generateRealSBOMFromFile(jobId, fileName, fileContent)
            const { analysis, analysisText } = await buildJobAnalysis({ jobId, type: 'file', source: fileName, sbom: sbomData })
            await SbomJob.create({
                jobId,
                type: 'file',
                source: fileName,
                status: 'completed',
                sbom: sbomData,
                analysis,
                analysisText,
                createdAt: new Date()
            })

            res.json({
                success: true,
                jobId,
                message: 'SBOM generated successfully',
                status: 'completed',
                sbom: sbomData,
                analysis,
                reportDownloadPath: `/api/sbom/job/${jobId}/report.txt`
            })
        }
    } catch (error) {
        console.error('Error creating file SBOM job:', error)
        res.status(500).json({ success: false, message: error.message })
    }
})

// Generate SBOM from Docker Hub image
app.post('/api/sbom/docker', async (req, res) => {
    try {
        const { image } = req.body
        const jobId = uuidv4()

        if (!image) {
            return res.status(400).json({
                success: false,
                message: 'Docker image name is required'
            })
        }

        // Validate Docker image format
        const imageRegex = /^[a-z0-9]+([._/-][a-z0-9]+)*\/[a-z0-9]+([._-][a-z0-9]+)*(:[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,127})?(@sha256:[a-f0-9]{64})?$|^[a-z0-9]+([._-][a-z0-9]+)*(:[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,127})?(@sha256:[a-f0-9]{64})?$/
        if (!imageRegex.test(image)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid Docker image format'
            })
        }

        console.log(`🐳 Creating SBOM generation job for Docker image: ${image}`)

        let useK8s = false
        if (batchApi) {
            // Try to create Kubernetes Job
            try {
                ensureJobWorkspace(jobId)
                await createK8sJobForDocker(jobId, image)
                useK8s = true
                await SbomJob.create({
                    jobId,
                    type: 'docker',
                    source: image,
                    status: 'pending',
                    sbom: null,
                    createdAt: new Date()
                })

                res.json({
                    success: true,
                    jobId,
                    message: 'SBOM generation job created in Kubernetes',
                    status: 'pending'
                })
            } catch (k8sError) {
                console.warn('⚠️  Kubernetes job creation failed, falling back to local mode:', k8sError.message)
                // Fall through to local mode
            }
        }

        if (!useK8s) {
            // Local Docker mode - generate SBOM using Docker + Syft
            const sbomData = await generateRealSBOMFromDocker(jobId, image)
            const { analysis, analysisText } = await buildJobAnalysis({ jobId, type: 'docker', source: image, sbom: sbomData })
            await SbomJob.create({
                jobId,
                type: 'docker',
                source: image,
                status: 'completed',
                sbom: sbomData,
                analysis,
                analysisText,
                createdAt: new Date()
            })

            res.json({
                success: true,
                jobId,
                message: 'SBOM generated successfully',
                status: 'completed',
                sbom: sbomData,
                analysis,
                reportDownloadPath: `/api/sbom/job/${jobId}/report.txt`
            })
        }
    } catch (error) {
        console.error('Error creating Docker SBOM job:', error)
        res.status(500).json({ success: false, message: error.message })
    }
})

// Get job status
app.get('/api/sbom/job/:jobId', async (req, res) => {
    try {
        const { jobId } = req.params

        const job = await SbomJob.findOne({ jobId })
        if (!job) {
            return res.status(404).json({ success: false, message: 'Job not found' })
        }

        const isTerminalStatus = ['completed', 'failed', 'not-found'].includes(job.status)

        if (batchApi && !isTerminalStatus) {
            // Check real Kubernetes job status
            try {
                const jobStatus = await checkK8sJobStatus(jobId)
                job.status = jobStatus.status
                if (jobStatus.sbom) {
                    job.sbom = jobStatus.sbom
                    const { analysis, analysisText } = await buildJobAnalysis(job)
                    job.analysis = analysis
                    job.analysisText = analysisText
                }
                await job.save()
            } catch (error) {
                console.warn('Could not check K8s job status:', error.message)
            }
        }

        if (job.status === 'completed' && job.sbom && (!job.analysis || !job.analysisText)) {
            const { analysis, analysisText } = await buildJobAnalysis(job)
            job.analysis = analysis
            job.analysisText = analysisText
            await job.save()
        }

        const jobData = {
            type: job.type,
            source: job.source,
            status: job.status,
            sbom: job.sbom,
            analysis: job.analysis,
            reportDownloadPath: `/api/sbom/job/${jobId}/report.txt`,
            createdAt: job.createdAt
        }

        res.json({
            success: true,
            jobId,
            ...jobData
        })
    } catch (error) {
        res.status(500).json({ success: false, message: error.message })
    }
})

app.get('/api/sbom/job/:jobId/report.txt', async (req, res) => {
    try {
        const { jobId } = req.params
        const job = await SbomJob.findOne({ jobId })

        if (!job) {
            return res.status(404).json({ success: false, message: 'Job not found' })
        }

        if (job.status !== 'completed' || !job.sbom) {
            return res.status(409).json({ success: false, message: 'SBOM analysis report is not ready yet' })
        }

        const needsReportRefresh = !job.analysisText || !job.analysisText.includes('VULNERABLE PACKAGES (WITH NAMES)')

        if (!job.analysis || needsReportRefresh) {
            const { analysis, analysisText } = await buildJobAnalysis(job)
            job.analysis = analysis
            job.analysisText = analysisText
            await job.save()
        }

        res.setHeader('Content-Type', 'text/plain; charset=utf-8')
        res.setHeader('Content-Disposition', `attachment; filename="sbom-analysis-${jobId}.txt"`)
        res.send(job.analysisText)
    } catch (error) {
        res.status(500).json({ success: false, message: error.message })
    }
})

// ============================================================
// KUBERNETES JOB FUNCTIONS
// ============================================================

async function createK8sJobForGitHub(jobId, githubUrl) {
    const jobName = `sbom-github-${jobId.substring(0, 8)}`

    const job = {
        apiVersion: 'batch/v1',
        kind: 'Job',
        metadata: {
            name: jobName,
            namespace: K8S_NAMESPACE
        },
        spec: {
            backoffLimit: 1,
            template: {
                metadata: {
                    labels: {
                        'sbom-job': jobId
                    }
                },
                spec: {
                    serviceAccountName: 'sbom-scanner',
                    restartPolicy: 'Never',
                    volumes: [
                        {
                            name: 'workspace',
                            persistentVolumeClaim: {
                                claimName: WORKSPACE_PVC_NAME
                            }
                        }
                    ],
                    containers: [
                        {
                            name: 'sbom-scanner',
                            image: SCANNER_IMAGE,
                            imagePullPolicy: 'IfNotPresent',
                            args: ['--repo', githubUrl],
                            env: [
                                { name: 'JOB_ID', value: jobId },
                                { name: 'JOB_TYPE', value: 'github' }
                            ],
                            volumeMounts: [
                                {
                                    name: 'workspace',
                                    mountPath: '/workspace',
                                    subPathExpr: 'jobs/$(JOB_ID)'
                                }
                            ],
                            resources: {
                                requests: { cpu: '100m', memory: '256Mi' },
                                limits: { cpu: '500m', memory: '512Mi' }
                            }
                        }
                    ]
                }
            }
        }
    }

    await batchApi.createNamespacedJob(K8S_NAMESPACE, job)
    console.log(`✅ Kubernetes Job created: ${jobName}`)
}

async function createK8sJobForFile(jobId, fileName, zipPathInJob) {
    const jobName = `sbom-file-${jobId.substring(0, 8)}`

    const job = {
        apiVersion: 'batch/v1',
        kind: 'Job',
        metadata: {
            name: jobName,
            namespace: K8S_NAMESPACE
        },
        spec: {
            backoffLimit: 1,
            template: {
                metadata: {
                    labels: {
                        'sbom-job': jobId
                    }
                },
                spec: {
                    serviceAccountName: 'sbom-scanner',
                    restartPolicy: 'Never',
                    volumes: [
                        {
                            name: 'workspace',
                            persistentVolumeClaim: {
                                claimName: WORKSPACE_PVC_NAME
                            }
                        }
                    ],
                    containers: [
                        {
                            name: 'sbom-scanner',
                            image: SCANNER_IMAGE,
                            imagePullPolicy: 'IfNotPresent',
                            args: ['--zip', zipPathInJob],
                            env: [
                                { name: 'FILE_NAME', value: fileName },
                                { name: 'JOB_ID', value: jobId },
                                { name: 'JOB_TYPE', value: 'file' }
                            ],
                            volumeMounts: [
                                {
                                    name: 'workspace',
                                    mountPath: '/workspace',
                                    subPathExpr: 'jobs/$(JOB_ID)'
                                }
                            ],
                            resources: {
                                requests: { cpu: '100m', memory: '256Mi' },
                                limits: { cpu: '500m', memory: '512Mi' }
                            }
                        }
                    ]
                }
            }
        }
    }

    await batchApi.createNamespacedJob(K8S_NAMESPACE, job)
    console.log(`✅ Kubernetes Job created: ${jobName}`)
}

async function createK8sJobForDocker(jobId, image) {
    const jobName = `sbom-docker-${jobId.substring(0, 8)}`

    const job = {
        apiVersion: 'batch/v1',
        kind: 'Job',
        metadata: {
            name: jobName,
            namespace: K8S_NAMESPACE
        },
        spec: {
            backoffLimit: 1,
            template: {
                metadata: {
                    labels: {
                        'sbom-job': jobId
                    }
                },
                spec: {
                    serviceAccountName: 'sbom-scanner',
                    restartPolicy: 'Never',
                    volumes: [
                        {
                            name: 'workspace',
                            persistentVolumeClaim: {
                                claimName: WORKSPACE_PVC_NAME
                            }
                        }
                    ],
                    containers: [
                        {
                            name: 'sbom-scanner',
                            image: SCANNER_IMAGE,
                            imagePullPolicy: 'IfNotPresent',
                            command: ['sh', '-c'],
                            args: [`syft ${image} -o spdx-json > /workspace/output/sbom.json`],
                            env: [
                                { name: 'DOCKER_IMAGE', value: image },
                                { name: 'JOB_ID', value: jobId },
                                { name: 'JOB_TYPE', value: 'docker' }
                            ],
                            volumeMounts: [
                                {
                                    name: 'workspace',
                                    mountPath: '/workspace',
                                    subPathExpr: 'jobs/$(JOB_ID)'
                                }
                            ],
                            resources: {
                                requests: { cpu: '100m', memory: '256Mi' },
                                limits: { cpu: '500m', memory: '512Mi' }
                            }
                        }
                    ]
                }
            }
        }
    }

    await batchApi.createNamespacedJob(K8S_NAMESPACE, job)
    console.log(`✅ Kubernetes Job created: ${jobName}`)
}

function sanitizeFileName(name) {
    return name.replace(/[^a-zA-Z0-9._-]/g, '_')
}

function ensureJobWorkspace(jobId) {
    const jobDir = path.join(WORKSPACE_DIR, jobId)
    const inputDir = path.join(jobDir, 'input')
    const outputDir = path.join(jobDir, 'output')

    fs.mkdirSync(inputDir, { recursive: true })
    fs.mkdirSync(outputDir, { recursive: true })

    return { jobDir, inputDir, outputDir }
}

function readSbomOutput(jobId) {
    const outputFile = path.join(WORKSPACE_DIR, jobId, 'output', 'sbom.json')
    if (!fs.existsSync(outputFile)) {
        return null
    }

    const sbomContent = fs.readFileSync(outputFile, 'utf-8')
    return JSON.parse(sbomContent)
}

async function checkK8sJobStatus(jobId) {
    try {
        const jobs = await batchApi.listNamespacedJob(
            K8S_NAMESPACE,
            undefined,
            undefined,
            undefined,
            undefined,
            `sbom-job=${jobId}`
        )

        if (jobs.body.items.length === 0) {
            return { status: 'not-found' }
        }

        const job = jobs.body.items[0]
        const status = job.status

        if (status.succeeded) {
            const sbom = readSbomOutput(jobId)
            return {
                status: sbom ? 'completed' : 'failed',
                sbom
            }
        } else if (status.failed) {
            return { status: 'failed', sbom: null }
        } else {
            return { status: 'running' }
        }
    } catch (error) {
        console.error('Error checking K8s job status:', error)
        throw error
    }
}

function parseLicenseList(raw) {
    return new Set(
        String(raw || '')
            .split(',')
            .map((value) => normalizeLicenseToken(value))
            .filter(Boolean)
    )
}

function normalizeLicenseToken(token) {
    return String(token || '')
        .trim()
        .toUpperCase()
        .replace(/\s+/g, '')
}

function normalizeLicenseDisplay(token) {
    return String(token || '').trim()
}

function extractLicenseTokens(value) {
    if (!value) {
        return []
    }

    const raw = String(value)
        .replace(/[()]/g, ' ')
        .split(/\s+(?:AND|OR|WITH)\s+/i)
        .map((token) => token.trim())
        .filter(Boolean)

    return raw.filter((token) => token.toLowerCase() !== 'noassertion' && token.toLowerCase() !== 'none')
}

function extractPackageLicenseEntries(pkg) {
    const entries = []

    if (pkg.licenseConcluded) {
        entries.push(...extractLicenseTokens(pkg.licenseConcluded))
    }

    if (pkg.licenseDeclared) {
        entries.push(...extractLicenseTokens(pkg.licenseDeclared))
    }

    if (Array.isArray(pkg.licenseInfoFromFiles)) {
        for (const value of pkg.licenseInfoFromFiles) {
            entries.push(...extractLicenseTokens(value))
        }
    }

    return Array.from(new Set(entries.map(normalizeLicenseDisplay).filter(Boolean)))
}

function extractComponentLicenseEntries(component) {
    const entries = []
    const rawLicenses = Array.isArray(component.licenses) ? component.licenses : []

    for (const licenseItem of rawLicenses) {
        const id = licenseItem?.license?.id
        const name = licenseItem?.license?.name
        const expression = licenseItem?.expression
        if (id) {
            entries.push(id)
        }
        if (name) {
            entries.push(name)
        }
        if (expression) {
            entries.push(...extractLicenseTokens(expression))
        }
    }

    return Array.from(new Set(entries.map(normalizeLicenseDisplay).filter(Boolean)))
}

function getPackageLicenseSource(pkg) {
    if (extractLicenseTokens(pkg?.licenseConcluded).length > 0) {
        return 'spdx_concluded'
    }
    if (extractLicenseTokens(pkg?.licenseDeclared).length > 0) {
        return 'spdx_declared'
    }
    if (Array.isArray(pkg?.licenseInfoFromFiles)) {
        for (const value of pkg.licenseInfoFromFiles) {
            if (extractLicenseTokens(value).length > 0) {
                return 'file_scan'
            }
        }
    }
    return 'missing'
}

function getComponentLicenseSource(component) {
    const rawLicenses = Array.isArray(component?.licenses) ? component.licenses : []
    for (const licenseItem of rawLicenses) {
        if (licenseItem?.license?.id || licenseItem?.license?.name) {
            return 'component_metadata'
        }
        if (extractLicenseTokens(licenseItem?.expression).length > 0) {
            return 'license_expression'
        }
    }
    return 'missing'
}

function classifyPackageScope(packageName) {
    const name = String(packageName || '').toLowerCase()

    if (
        name.startsWith('actions/') ||
        name.startsWith('docker://') ||
        name.includes('/action@') ||
        name.includes('github-action') ||
        name.includes('pre-commit-ci/') ||
        name.includes('setup-python@') ||
        name.includes('checkout@v')
    ) {
        return 'ci'
    }

    if (
        name.startsWith('pytest') ||
        name.startsWith('mypy') ||
        name.startsWith('ruff') ||
        name.startsWith('black') ||
        name.startsWith('coverage') ||
        name.startsWith('mkdocs') ||
        name.startsWith('types-') ||
        name.startsWith('pre-commit')
    ) {
        return 'dev'
    }

    return 'runtime'
}

function getConfidenceForIssue(classification, licenseSource) {
    if (classification === 'forbidden' || classification === 'restricted') {
        return 'high'
    }
    if (licenseSource === 'missing') {
        return 'low'
    }
    return 'medium'
}

function extractPurlFromSpdxPackage(pkg) {
    const refs = Array.isArray(pkg?.externalRefs) ? pkg.externalRefs : []
    for (const ref of refs) {
        const type = String(ref?.referenceType || '').toLowerCase()
        if (type.includes('purl') && ref?.referenceLocator) {
            return String(ref.referenceLocator)
        }
    }
    return null
}

function parsePurl(purl) {
    if (!purl || !String(purl).startsWith('pkg:')) {
        return { ecosystem: null, name: null }
    }

    const body = String(purl).slice(4)
    const [typeAndName] = body.split('@')
    const firstSlash = typeAndName.indexOf('/')
    if (firstSlash === -1) {
        return { ecosystem: null, name: null }
    }

    const purlType = typeAndName.slice(0, firstSlash).toLowerCase()
    const packageName = decodeURIComponent(typeAndName.slice(firstSlash + 1))

    const ecosystemMap = {
        npm: 'npm',
        pypi: 'PyPI',
        maven: 'Maven',
        golang: 'Go',
        nuget: 'NuGet',
        cargo: 'crates.io',
        gem: 'RubyGems',
        composer: 'Packagist',
        hex: 'Hex'
    }

    return {
        ecosystem: ecosystemMap[purlType] || null,
        name: packageName || null
    }
}

function inferEcosystemFromName(packageName) {
    const name = String(packageName || '').toLowerCase()

    if (name.startsWith('actions/') || name.startsWith('docker://') || name.includes('/action@')) {
        return 'GitHub Actions'
    }

    if (name.startsWith('@') || (name.includes('/') && name.includes('@'))) {
        return 'npm'
    }

    return 'unknown'
}

function normalizePackageForOsv(packageEntry) {
    const version = String(packageEntry.version || '').trim()
    if (!version || version.toLowerCase() === 'unknown') {
        return null
    }

    const ecosystem = packageEntry.ecosystem
    if (!ecosystem || ecosystem === 'unknown' || ecosystem === 'GitHub Actions') {
        return null
    }

    return {
        ecosystem,
        name: packageEntry.normalizedName,
        version,
        displayName: packageEntry.name
    }
}

function inferOsvSeverity(vuln) {
    const dbSeverity = String(vuln?.database_specific?.severity || '').toUpperCase()
    if (['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(dbSeverity)) {
        return dbSeverity
    }

    return 'UNKNOWN'
}

function getFirstFixedVersion(vuln) {
    const affected = Array.isArray(vuln?.affected) ? vuln.affected : []
    for (const item of affected) {
        const ranges = Array.isArray(item?.ranges) ? item.ranges : []
        for (const range of ranges) {
            const events = Array.isArray(range?.events) ? range.events : []
            for (const event of events) {
                if (event?.fixed) {
                    return String(event.fixed)
                }
            }
        }
    }

    return null
}

async function fetchOsvBatch(packageEntries) {
    if (!ENABLE_OSV_ANALYSIS) {
        return { findings: [], skipped: 'disabled' }
    }

    const candidates = packageEntries
        .map((entry) => normalizePackageForOsv(entry))
        .filter(Boolean)

    const uniqueMap = new Map()
    for (const candidate of candidates) {
        const key = `${candidate.ecosystem}|${candidate.name}|${candidate.version}`
        if (!uniqueMap.has(key)) {
            uniqueMap.set(key, candidate)
        }
    }

    const queries = Array.from(uniqueMap.values()).slice(0, OSV_ANALYSIS_MAX_PACKAGES)
    if (!queries.length) {
        return { findings: [], skipped: 'no-supported-packages' }
    }

    try {
        const response = await fetch('https://api.osv.dev/v1/querybatch', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                queries: queries.map((item) => ({
                    package: { ecosystem: item.ecosystem, name: item.name },
                    version: item.version
                }))
            })
        })

        if (!response.ok) {
            return { findings: [], skipped: `osv-http-${response.status}` }
        }

        const payload = await response.json()
        const results = Array.isArray(payload?.results) ? payload.results : []

        const findings = []
        for (let i = 0; i < results.length; i += 1) {
            const result = results[i]
            const query = queries[i]
            const vulns = Array.isArray(result?.vulns) ? result.vulns : []
            if (!vulns.length) {
                continue
            }

            const vulnerabilities = vulns.map((vuln) => ({
                id: vuln.id || 'UNKNOWN-ID',
                severity: inferOsvSeverity(vuln),
                fixedVersion: getFirstFixedVersion(vuln)
            }))

            findings.push({
                package: query.displayName || query.name || 'unknown-package',
                normalizedName: query.name,
                ecosystem: query.ecosystem,
                version: query.version,
                vulnerabilities
            })
        }

        return { findings, skipped: null, queriedCount: queries.length }
    } catch (error) {
        return { findings: [], skipped: `osv-error-${error.message}` }
    }
}

function classifyLicense(licenseName) {
    const normalized = normalizeLicenseToken(licenseName)
    if (!normalized) {
        return 'unknown'
    }

    if (FORBIDDEN_LICENSES.has(normalized)) {
        return 'forbidden'
    }

    if (RESTRICTED_LICENSES.has(normalized)) {
        return 'restricted'
    }

    return 'allowed'
}

function makeViolation(policyId, rule, status, packages) {
    return {
        id: policyId,
        rule,
        status,
        affectedPackages: packages.length,
        packages
    }
}

function dedupeIssues(issues) {
    const grouped = new Map()

    for (const issue of issues) {
        const key = [issue.package, issue.version, issue.license, issue.classification, issue.scope].join('|')
        const existing = grouped.get(key)
        if (existing) {
            existing.occurrences += 1
            continue
        }

        grouped.set(key, {
            ...issue,
            occurrences: 1
        })
    }

    return Array.from(grouped.values()).sort((a, b) => {
        const byPackage = a.package.localeCompare(b.package)
        if (byPackage !== 0) {
            return byPackage
        }
        return a.version.localeCompare(b.version)
    })
}

function buildVulnerabilitySummary(findings) {
    const severityCounts = {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        unknown: 0
    }

    const packageUpdates = []

    for (const finding of findings) {
        for (const vuln of finding.vulnerabilities) {
            const sev = String(vuln.severity || 'UNKNOWN').toLowerCase()
            if (sev === 'critical') {
                severityCounts.critical += 1
            } else if (sev === 'high') {
                severityCounts.high += 1
            } else if (sev === 'medium') {
                severityCounts.medium += 1
            } else if (sev === 'low') {
                severityCounts.low += 1
            } else {
                severityCounts.unknown += 1
            }

            if (vuln.fixedVersion) {
                packageUpdates.push({
                    package: finding.package,
                    ecosystem: finding.ecosystem,
                    currentVersion: finding.version,
                    fixedVersion: vuln.fixedVersion,
                    vulnerabilityId: vuln.id,
                    severity: vuln.severity
                })
            }
        }
    }

    const uniqueUpdates = dedupeIssues(
        packageUpdates.map((item) => ({
            package: item.package,
            version: `${item.currentVersion}->${item.fixedVersion}`,
            license: item.vulnerabilityId,
            classification: 'update',
            scope: item.ecosystem,
            severity: item.severity
        }))
    ).map((item) => {
        const [currentVersion, fixedVersion] = item.version.split('->')
        return {
            package: item.package,
            ecosystem: item.scope,
            currentVersion,
            fixedVersion,
            vulnerabilityId: item.license,
            severity: item.severity,
            occurrences: item.occurrences
        }
    })

    return {
        totalAffectedPackages: findings.length,
        totalVulnerabilities: findings.reduce((acc, item) => acc + item.vulnerabilities.length, 0),
        severityCounts,
        findings,
        packageUpdates: uniqueUpdates
    }
}

async function analyzeSbom(sbom, meta = {}) {
    const packageEntries = []

    if (Array.isArray(sbom?.packages)) {
        for (const pkg of sbom.packages) {
            const licenses = extractPackageLicenseEntries(pkg)
            const purl = extractPurlFromSpdxPackage(pkg)
            const purlInfo = parsePurl(purl)
            packageEntries.push({
                name: pkg.name || 'unknown-package',
                normalizedName: purlInfo.name || pkg.name || 'unknown-package',
                version: pkg.versionInfo || 'unknown',
                licenses,
                scope: classifyPackageScope(pkg.name),
                licenseSource: getPackageLicenseSource(pkg),
                ecosystem: purlInfo.ecosystem || inferEcosystemFromName(pkg.name),
                purl
            })
        }
    } else if (Array.isArray(sbom?.components)) {
        for (const component of sbom.components) {
            const licenses = extractComponentLicenseEntries(component)
            const purlInfo = parsePurl(component.purl)
            packageEntries.push({
                name: component.name || 'unknown-component',
                normalizedName: purlInfo.name || component.name || 'unknown-component',
                version: component.version || 'unknown',
                licenses,
                scope: classifyPackageScope(component.name),
                licenseSource: getComponentLicenseSource(component),
                ecosystem: purlInfo.ecosystem || inferEcosystemFromName(component.name),
                purl: component.purl || null
            })
        }
    }

    const issues = []
    const forbiddenPackages = []
    const restrictedPackages = []
    const unknownPackages = []

    for (const pkg of packageEntries) {
        if (!pkg.licenses.length) {
            const unknownIssue = {
                package: pkg.name,
                version: pkg.version,
                license: 'UNKNOWN',
                classification: 'unknown',
                scope: pkg.scope,
                ecosystem: pkg.ecosystem,
                licenseSource: pkg.licenseSource,
                confidence: getConfidenceForIssue('unknown', pkg.licenseSource),
                policyRule: 'License must be declared'
            }

            unknownPackages.push(unknownIssue)
            issues.push(unknownIssue)
            continue
        }

        for (const license of pkg.licenses) {
            const classification = classifyLicense(license)
            if (classification === 'allowed') {
                continue
            }

            const issue = {
                package: pkg.name,
                version: pkg.version,
                license,
                classification,
                scope: pkg.scope,
                ecosystem: pkg.ecosystem,
                licenseSource: pkg.licenseSource,
                confidence: getConfidenceForIssue(classification, pkg.licenseSource),
                policyRule:
                    classification === 'forbidden'
                        ? 'Forbidden licenses are not allowed'
                        : classification === 'restricted'
                            ? 'Restricted licenses require legal review'
                            : 'License must be declared'
            }

            issues.push(issue)

            if (classification === 'forbidden') {
                forbiddenPackages.push(issue)
            } else if (classification === 'restricted') {
                restrictedPackages.push(issue)
            } else {
                unknownPackages.push(issue)
            }
        }
    }

    const policyViolations = [
        makeViolation(
            'POLICY-LICENSE-FORBIDDEN',
            'Forbidden licenses are not allowed',
            forbiddenPackages.length > 0 ? 'failed' : 'passed',
            forbiddenPackages.map((entry) => ({
                name: entry.package,
                version: entry.version,
                reason: `${entry.license} is forbidden`
            }))
        ),
        makeViolation(
            'POLICY-LICENSE-RESTRICTED',
            'Restricted licenses require legal review',
            restrictedPackages.length > 0 ? 'failed' : 'passed',
            restrictedPackages.map((entry) => ({
                name: entry.package,
                version: entry.version,
                reason: `${entry.license} requires legal review`
            }))
        )
    ]

    const dedupedIssues = dedupeIssues(issues)
    const dedupedForbidden = dedupeIssues(forbiddenPackages)
    const dedupedRestricted = dedupeIssues(restrictedPackages)
    const dedupedUnknown = dedupeIssues(unknownPackages)
    const unknownRuntime = dedupedUnknown.filter((item) => item.scope === 'runtime')
    const unknownNonRuntime = dedupedUnknown.filter((item) => item.scope !== 'runtime')

    const osvResult = await fetchOsvBatch(packageEntries)
    const vulnerabilitySummary = buildVulnerabilitySummary(osvResult.findings)

    const ecosystemMap = new Map()
    for (const entry of packageEntries) {
        const key = entry.ecosystem || 'unknown'
        ecosystemMap.set(key, (ecosystemMap.get(key) || 0) + 1)
    }
    const ecosystems = Array.from(ecosystemMap.entries())
        .map(([ecosystem, count]) => ({ ecosystem, count }))
        .sort((a, b) => b.count - a.count)

    const recommendations = []
    if (dedupedForbidden.length > 0) {
        recommendations.push('Replace or remove packages using forbidden licenses before production release.')
    }
    if (dedupedRestricted.length > 0) {
        recommendations.push('Send restricted-license packages to legal/compliance review.')
    }
    if (dedupedUnknown.length > 0) {
        recommendations.push('Resolve packages with missing license information and re-run analysis.')
        if (unknownRuntime.length > 0) {
            recommendations.push(`Prioritize runtime unknown licenses first (${unknownRuntime.length} unique runtime packages).`)
        }
    }
    if (vulnerabilitySummary.totalVulnerabilities > 0) {
        recommendations.push(
            `Fix vulnerable packages identified by OSV (${vulnerabilitySummary.totalVulnerabilities} vulnerabilities across ${vulnerabilitySummary.totalAffectedPackages} packages).`
        )
    }
    for (const update of vulnerabilitySummary.packageUpdates.slice(0, 15)) {
        recommendations.push(
            `Upgrade ${update.package} (${update.ecosystem}) from ${update.currentVersion} to ${update.fixedVersion} for ${update.vulnerabilityId}.`
        )
    }
    if (recommendations.length === 0) {
        recommendations.push('No license policy violations detected. Keep dependencies monitored in CI.')
    }

    return {
        generatedAt: new Date().toISOString(),
        sourceType: meta.type || 'unknown',
        source: meta.source || 'unknown',
        totalPackages: packageEntries.length,
        uniquePackages: dedupeIssues(packageEntries.map((pkg) => ({
            package: pkg.name,
            version: pkg.version,
            license: 'N/A',
            classification: 'info',
            scope: pkg.scope
        }))).length,
        packageTypes: ecosystems,
        licenses: {
            forbidden: dedupedForbidden.length,
            restricted: dedupedRestricted.length,
            unknown: dedupedUnknown.length,
            unknownRuntime: unknownRuntime.length,
            unknownNonRuntime: unknownNonRuntime.length,
            issues: dedupedIssues,
            forbiddenPackages: dedupedForbidden.map((entry) => ({
                package: entry.package,
                version: entry.version,
                license: entry.license
            }))
        },
        vulnerabilities: {
            ...vulnerabilitySummary,
            skippedReason: osvResult.skipped || null,
            queriedPackages: osvResult.queriedCount || 0
        },
        policyViolations,
        recommendations
    }
}

function formatIssueList(items) {
    if (!items.length) {
        return '- None'
    }

    return items
        .map((item) => {
            const countSuffix = item.occurrences > 1 ? ` [x${item.occurrences}]` : ''
            const scope = item.scope ? ` | scope: ${item.scope}` : ''
            const ecosystem = item.ecosystem ? ` | type: ${item.ecosystem}` : ''
            const source = item.licenseSource ? ` | source: ${item.licenseSource}` : ''
            const confidence = item.confidence ? ` | confidence: ${item.confidence}` : ''
            return `- ${item.package}@${item.version} (${item.license})${countSuffix}${scope}${ecosystem}${source}${confidence}`
        })
        .join('\n')
}

function formatPolicyViolationList(violations) {
    if (!violations.length) {
        return '- None'
    }

    return violations
        .map((violation, index) => {
            const packageLines = violation.packages.length
                ? violation.packages.map((pkg) => `    - ${pkg.name}@${pkg.version}: ${pkg.reason}`).join('\n')
                : '    - None'

            return `${index + 1}) ${violation.id} | ${violation.rule} | ${violation.status.toUpperCase()} | affected: ${violation.affectedPackages}\n${packageLines}`
        })
        .join('\n')
}

function truncateCell(value, maxLength) {
    const text = String(value ?? '')
    if (text.length <= maxLength) {
        return text
    }
    return `${text.slice(0, Math.max(0, maxLength - 1))}…`
}

function padCell(value, width) {
    const text = truncateCell(value, width)
    return text.padEnd(width, ' ')
}

function padCellLeft(value, width) {
    const text = truncateCell(value, width)
    return text.padStart(width, ' ')
}

function formatIssueTable(items, options = {}) {
    if (!items.length) {
        return '- None'
    }

    const useColor = Boolean(options.useColor)
    const columns = [
        { key: 'package', title: 'PACKAGE', minWidth: 20, maxWidth: 40, align: 'left' },
        { key: 'version', title: 'VERSION', minWidth: 8, maxWidth: 18, align: 'left' },
        { key: 'license', title: 'LICENSE', minWidth: 7, maxWidth: 10, align: 'left' },
        { key: 'scope', title: 'SCOPE', minWidth: 5, maxWidth: 10, align: 'left' },
        { key: 'ecosystem', title: 'TYPE', minWidth: 4, maxWidth: 18, align: 'left' },
        { key: 'licenseSource', title: 'SOURCE', minWidth: 6, maxWidth: 14, align: 'left' },
        { key: 'confidence', title: 'CONF', minWidth: 4, maxWidth: 8, align: 'left' },
        { key: 'occurrences', title: 'COUNT', minWidth: 5, maxWidth: 6, align: 'right' }
    ]

    const resolvedColumns = columns.map((column) => {
        const maxDataLength = items.reduce((maxLen, item) => {
            const value = item[column.key] == null ? '' : String(item[column.key])
            return Math.max(maxLen, value.length)
        }, 0)

        const width = Math.min(
            column.maxWidth,
            Math.max(column.minWidth, column.title.length, maxDataLength)
        )

        return {
            ...column,
            width
        }
    })

    const header = resolvedColumns
        .map((col) => (col.align === 'right' ? padCellLeft(col.title, col.width) : padCell(col.title, col.width)))
        .join(' | ')
        .trimEnd()

    const separator = resolvedColumns.map((col) => '-'.repeat(col.width)).join('-+-')
    const red = '\x1b[31m'
    const blue = '\x1b[34m'
    const reset = '\x1b[0m'

    const rows = items.map((item, index) => {
        const raw = resolvedColumns
            .map((col) => {
                const rawValue = item[col.key] == null ? '' : item[col.key]
                if (col.align === 'right') {
                    return padCellLeft(rawValue, col.width)
                }
                return padCell(rawValue, col.width)
            })
            .join(' | ')
            .trimEnd()

        if (!useColor) {
            return raw
        }

        const color = index % 2 === 0 ? red : blue
        return `${color}${raw}${reset}`
    })

    return [header, separator, ...rows].join('\n')
}

function buildAnalysisTextReport(job, analysis) {
    const forbiddenIssues = analysis.licenses.issues.filter((issue) => issue.classification === 'forbidden')
    const restrictedIssues = analysis.licenses.issues.filter((issue) => issue.classification === 'restricted')
    const unknownIssues = analysis.licenses.issues.filter((issue) => issue.classification === 'unknown')
    const unknownRuntimeIssues = unknownIssues.filter((issue) => issue.scope === 'runtime')
    const unknownNonRuntimeIssues = unknownIssues.filter((issue) => issue.scope !== 'runtime')
    const packageTypeLines = (analysis.packageTypes || [])
        .map((item) => `- ${item.ecosystem}: ${item.count}`)
        .join('\n')
    const vulnerability = analysis.vulnerabilities || {}
    const severity = vulnerability.severityCounts || {}
    const vulnerabilityFindingLines = (vulnerability.findings || [])
        .map((item) => {
            const vulnerabilityList = (item.vulnerabilities || [])
                .map((vuln) => {
                    const fixSuffix = vuln.fixedVersion ? ` -> fixed in ${vuln.fixedVersion}` : ''
                    return `${vuln.id} (${vuln.severity || 'UNKNOWN'})${fixSuffix}`
                })
                .join(', ')

            return `- ${item.package}@${item.version} (${item.ecosystem}): ${vulnerabilityList || 'No details'}`
        })
        .join('\n')
    const updateLines = (vulnerability.packageUpdates || [])
        .slice(0, 25)
        .map((item) => {
            const countSuffix = item.occurrences > 1 ? ` [x${item.occurrences}]` : ''
            return `- ${item.package} (${item.ecosystem}) ${item.currentVersion} -> ${item.fixedVersion} for ${item.vulnerabilityId}${countSuffix}`
        })
        .join('\n')

    return [
        'SBOM Security & License Analysis Report',
        '======================================',
        '',
        `Job ID: ${job.jobId}`,
        `Source Type: ${job.type}`,
        `Source: ${job.source}`,
        `Generated At: ${analysis.generatedAt}`,
        '',
        'SUMMARY',
        '-------',
        `Total Packages: ${analysis.totalPackages}`,
        `Unique Packages: ${analysis.uniquePackages}`,
        `Forbidden Licenses: ${analysis.licenses.forbidden}`,
        `Restricted Licenses: ${analysis.licenses.restricted}`,
        `Unknown Licenses: ${analysis.licenses.unknown}`,
        `Unknown Runtime Packages: ${analysis.licenses.unknownRuntime}`,
        `Unknown Non-Runtime Packages: ${analysis.licenses.unknownNonRuntime}`,
        `Vulnerability-Affected Packages: ${vulnerability.totalAffectedPackages || 0}`,
        `Total Vulnerabilities: ${vulnerability.totalVulnerabilities || 0}`,
        `Vulnerability Scan Source: OSV (${vulnerability.skippedReason ? `limited: ${vulnerability.skippedReason}` : 'enabled'})`,
        '',
        'PACKAGE TYPES',
        '-------------',
        packageTypeLines || '- None',
        '',
        'VULNERABILITY SEVERITY',
        '----------------------',
        `Critical: ${severity.critical || 0}`,
        `High: ${severity.high || 0}`,
        `Medium: ${severity.medium || 0}`,
        `Low: ${severity.low || 0}`,
        `Unknown: ${severity.unknown || 0}`,
        '',
        'VULNERABLE PACKAGES (WITH NAMES)',
        '--------------------------------',
        vulnerabilityFindingLines || '- None',
        '',
        'ABOUT UNKNOWN LICENSES',
        '----------------------',
        'UNKNOWN means license metadata was missing or NOASSERTION in the SBOM entry.',
        'It does not automatically mean the package is forbidden.',
        '',
        'FORBIDDEN LICENSE PACKAGES',
        '--------------------------',
        formatIssueList(forbiddenIssues),
        '',
        'RESTRICTED LICENSE PACKAGES',
        '---------------------------',
        formatIssueList(restrictedIssues),
        '',
        'UNKNOWN LICENSE PACKAGES (NON-RUNTIME: CI/DEV)',
        '-----------------------------------------------',
        formatIssueTable(unknownNonRuntimeIssues, { useColor: REPORT_ANSI_COLORS }),
        '',
        'PACKAGES NEEDING UPDATE (VULNERABILITIES)',
        '-----------------------------------------',
        updateLines || '- None',
        '',
        'POLICY VIOLATIONS',
        '-----------------',
        formatPolicyViolationList(analysis.policyViolations),
        '',
        'RECOMMENDATIONS',
        '---------------',
        analysis.recommendations.map((item, index) => `${index + 1}. ${item}`).join('\n'),
        '',
        'UNKNOWN LICENSE PACKAGES',
        '------------------------',
        formatIssueTable(unknownIssues, { useColor: REPORT_ANSI_COLORS }),
        '',
        'UNKNOWN LICENSE PACKAGES (RUNTIME)',
        '----------------------------------',
        formatIssueTable(unknownRuntimeIssues, { useColor: REPORT_ANSI_COLORS })
    ].join('\n')
}

async function buildJobAnalysis(jobRecord) {
    if (!jobRecord?.sbom) {
        return { analysis: null, analysisText: null }
    }

    const analysis = await analyzeSbom(jobRecord.sbom, {
        type: jobRecord.type,
        source: jobRecord.source
    })
    const analysisText = buildAnalysisTextReport(jobRecord, analysis)
    return { analysis, analysisText }
}

// ============================================================
// MOCK DATA GENERATION
// ============================================================


// ============================================================
// REAL SBOM GENERATION FUNCTIONS (using Docker + Syft)
// ============================================================

async function generateRealSBOMFromGitHub(jobId, githubUrl) {
    try {
        const jobDir = path.join(WORKSPACE_DIR, jobId)
        const projectDir = path.join(jobDir, 'project')
        const outputDir = path.join(jobDir, 'output')

        // Create directories
        if (!fs.existsSync(jobDir)) {
            fs.mkdirSync(jobDir, { recursive: true })
        }
        fs.mkdirSync(projectDir, { recursive: true })
        fs.mkdirSync(outputDir, { recursive: true })

        console.log(`📥 Cloning GitHub repo: ${githubUrl}`)

        try {
            execSync(`GIT_TERMINAL_PROMPT=0 git clone --depth 1 --filter=blob:none ${githubUrl} "${projectDir}"`, {
                stdio: 'ignore',
                timeout: 180000
            })
        } catch (e) {
            return handleRealSbomFailure('github', githubUrl, 'Git clone failed')
        }

        console.log(`🔍 Scanning project for components...`)

        // Run Syft in Docker container
        const outputFile = path.join(outputDir, 'sbom.json')
        try {
            execSync(`docker run --rm -v "${projectDir}:/workspace/project:ro" -v "${outputDir}:/workspace/output" sbom-scanner:latest --path /workspace/project`, {
                stdio: 'inherit',
                timeout: 60000
            })
        } catch (e) {
            return handleRealSbomFailure('github', githubUrl, 'SBOM generation failed')
        }

        // Read generated SBOM
        if (fs.existsSync(outputFile)) {
            const sbomContent = fs.readFileSync(outputFile, 'utf-8')
            console.log(`✅ Real SBOM generated from ${githubUrl}`)
            return JSON.parse(sbomContent)
        }

        return handleRealSbomFailure('github', githubUrl, 'SBOM output not found')
    } catch (error) {
        console.error('Error in generateRealSBOMFromGitHub:', error.message)
        return handleRealSbomFailure('github', githubUrl, error.message)
    }
}

async function generateRealSBOMFromFile(jobId, fileName, fileContent) {
    try {
        const jobDir = path.join(WORKSPACE_DIR, jobId)
        const projectDir = path.join(jobDir, 'project')
        const outputDir = path.join(jobDir, 'output')
        const zipPath = path.join(jobDir, fileName)

        // Create directories
        if (!fs.existsSync(jobDir)) {
            fs.mkdirSync(jobDir, { recursive: true })
        }
        fs.mkdirSync(projectDir, { recursive: true })
        fs.mkdirSync(outputDir, { recursive: true })

        console.log(`📦 Processing uploaded file: ${fileName}`)

        // Decode base64 and write ZIP file
        const buffer = Buffer.from(fileContent, 'base64')
        fs.writeFileSync(zipPath, buffer)

        // Extract ZIP
        try {
            execSync(`unzip -q "${zipPath}" -d "${projectDir}"`, {
                stdio: 'ignore',
                timeout: 15000
            })
        } catch (e) {
            return handleRealSbomFailure('file', fileName, 'ZIP extraction failed')
        }

        console.log(`🔍 Scanning uploaded project for components...`)

        // Run Syft in Docker container
        const outputFile = path.join(outputDir, 'sbom.json')
        try {
            execSync(`docker run --rm -v "${projectDir}:/workspace/project:ro" -v "${outputDir}:/workspace/output" sbom-scanner:latest --path /workspace/project`, {
                stdio: 'inherit',
                timeout: 60000
            })
        } catch (e) {
            return handleRealSbomFailure('file', fileName, 'SBOM generation failed')
        }

        // Read generated SBOM
        if (fs.existsSync(outputFile)) {
            const sbomContent = fs.readFileSync(outputFile, 'utf-8')
            console.log(`✅ Real SBOM generated from ${fileName}`)
            return JSON.parse(sbomContent)
        }

        return handleRealSbomFailure('file', fileName, 'SBOM output not found')
    } catch (error) {
        console.error('Error in generateRealSBOMFromFile:', error.message)
        return handleRealSbomFailure('file', fileName, error.message)
    }
}

async function generateRealSBOMFromDocker(jobId, image) {
    try {
        const jobDir = path.join(WORKSPACE_DIR, jobId)
        const outputDir = path.join(jobDir, 'output')

        // Create directories
        if (!fs.existsSync(jobDir)) {
            fs.mkdirSync(jobDir, { recursive: true })
        }
        fs.mkdirSync(outputDir, { recursive: true })

        console.log(`🐳 Pulling Docker image: ${image}`)

        // Pull the Docker image
        try {
            execSync(`docker pull ${image}`, {
                stdio: 'ignore',
                timeout: 120000
            })
        } catch (e) {
            return handleRealSbomFailure('docker', image, 'Docker pull failed')
        }

        console.log(`🔍 Scanning Docker image for components...`)

        // Run Syft to generate SBOM
        const outputFile = path.join(outputDir, 'sbom.json')
        try {
            execSync(`docker run --rm --entrypoint syft -v "${outputDir}:/workspace/output" sbom-scanner:latest ${image} -o json > ${outputFile}`, {
                stdio: 'inherit',
                timeout: 120000
            })
        } catch (e) {
            return handleRealSbomFailure('docker', image, 'SBOM generation failed')
        }

        // Read generated SBOM
        if (fs.existsSync(outputFile)) {
            const sbomContent = fs.readFileSync(outputFile, 'utf-8')
            console.log(`✅ Real SBOM generated from ${image}`)
            return JSON.parse(sbomContent)
        }

        return handleRealSbomFailure('docker', image, 'SBOM output not found')
    } catch (error) {
        console.error('Error in generateRealSBOMFromDocker:', error.message)
        return handleRealSbomFailure('docker', image, error.message)
    }
}

function handleRealSbomFailure(type, source, message) {
    throw new Error(message)
}

// ============================================================
// ERROR HANDLING
// ============================================================

app.use((err, req, res, next) => {
    console.error('Error:', err)
    res.status(500).json({
        success: false,
        message: err.message || 'Internal server error'
    })
})

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Endpoint not found'
    })
})

// ============================================================
// START SERVER
// ============================================================

async function startServer() {
    try {
        await mongoose.connect(MONGO_URL, {
            serverSelectionTimeoutMS: 5000
        })
        console.log('MongoDB connected')

        app.listen(PORT, () => {
            console.log(`SBOM backend listening on http://localhost:${PORT}`)
            console.log(`Health endpoint: GET http://localhost:${PORT}/health`)
            console.log('Auth endpoints: POST /api/auth/signup, POST /api/auth/login')
            console.log('SBOM endpoints: POST /api/sbom/github, POST /api/sbom/docker, POST /api/sbom/upload, GET /api/sbom/job/:jobId, GET /api/sbom/job/:jobId/report.txt')
            console.log(batchApi ? 'Kubernetes integration enabled' : 'Running in local mode (no Kubernetes)')
        })
    } catch (error) {
        console.error('❌ MongoDB connection failed:', error.message)
        process.exit(1)
    }
}

startServer()
