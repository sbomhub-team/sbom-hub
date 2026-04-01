import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
    generateSBOMFromGitHub,
    generateSBOMFromFile,
    validateFile,
    validateGitHub,
    getSBOMJobStatus,
    downloadSBOMAnalysisReport
} from '../api'

function readUserFromStorage() {
    const stored = localStorage.getItem('user')
    return stored ? JSON.parse(stored) : null
}

function getSbomSummary(sbomResponse) {
    const document = sbomResponse?.sbom
    if (!document) {
        return {
            format: 'Unknown',
            componentCount: 0,
            generatedAt: null
        }
    }

    const format = document.spdxVersion ? 'SPDX' : document.bomFormat || 'Unknown'
    const componentCount = Array.isArray(document.components)
        ? document.components.length
        : Array.isArray(document.packages)
            ? document.packages.length
            : 0
    const generatedAt = document.metadata?.timestamp || document.creationInfo?.created || null

    return {
        format,
        componentCount,
        generatedAt
    }
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export default function Dashboard() {
    const navigate = useNavigate()

    const user = readUserFromStorage()
    const [activeTab, setActiveTab] = useState('upload')

    const [zipFile, setZipFile] = useState(null)
    const [zipError, setZipError] = useState('')
    const [zipLoading, setZipLoading] = useState(false)

    const [githubUrl, setGithubUrl] = useState('')
    const [githubError, setGithubError] = useState('')

    const [sbom, setSbom] = useState(null)
    const [sbomLoading, setSbomLoading] = useState(false)
    const [reportLoading, setReportLoading] = useState(false)

    const sbomSummary = getSbomSummary(sbom)

    const waitForJobResult = async (jobId) => {
        const maxAttempts = 60

        for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
            await wait(3000)
            const status = await getSBOMJobStatus(jobId)

            if (status.status === 'completed') {
                return status
            }

            if (status.status === 'failed' || status.status === 'not-found') {
                throw new Error('SBOM job failed on the server')
            }
        }

        throw new Error('SBOM generation timed out. Please try again.')
    }

    const handleZipUpload = async (event) => {
        const file = event.target.files?.[0]
        if (!file) {
            return
        }

        setZipError('')
        setZipLoading(true)

        try {
            await validateFile(file)
            setZipFile(file)
        } catch (error) {
            setZipFile(null)
            setZipError(error.message || 'File validation failed')
        } finally {
            setZipLoading(false)
        }
    }

    const generateFromZip = async () => {
        if (!zipFile) {
            return
        }

        setZipError('')
        setSbomLoading(true)

        try {
            const payload = await validateFile(zipFile)
            const startResponse = await generateSBOMFromFile(payload.fileName, payload.size, payload.content)

            if (startResponse.status === 'pending' && startResponse.jobId) {
                const completedResponse = await waitForJobResult(startResponse.jobId)
                setSbom(completedResponse)
            } else {
                setSbom(startResponse)
            }
        } catch (error) {
            setZipError(error.message || 'SBOM generation failed')
        } finally {
            setSbomLoading(false)
        }
    }

    const generateFromGithub = async () => {
        if (!githubUrl.trim()) {
            return
        }

        setGithubError('')
        setSbomLoading(true)

        try {
            await validateGitHub(githubUrl)
            const startResponse = await generateSBOMFromGitHub(githubUrl)

            if (startResponse.status === 'pending' && startResponse.jobId) {
                const completedResponse = await waitForJobResult(startResponse.jobId)
                setSbom(completedResponse)
            } else {
                setSbom(startResponse)
            }
        } catch (error) {
            setGithubError(error.message || 'SBOM generation failed')
        } finally {
            setSbomLoading(false)
        }
    }

    const downloadSBOM = () => {
        if (!sbom?.sbom) {
            return
        }

        const data = JSON.stringify(sbom.sbom, null, 2)
        const blob = new Blob([data], { type: 'application/json' })
        const url = URL.createObjectURL(blob)

        const link = document.createElement('a')
        link.href = url
        link.download = `sbom-${Date.now()}.json`
        document.body.appendChild(link)
        link.click()

        document.body.removeChild(link)
        URL.revokeObjectURL(url)
    }

    const downloadAnalysisReport = async () => {
        if (!sbom?.jobId) {
            return
        }

        setReportLoading(true)
        setZipError('')
        setGithubError('')

        try {
            const text = await downloadSBOMAnalysisReport(sbom.jobId)
            const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
            const url = URL.createObjectURL(blob)

            const link = document.createElement('a')
            link.href = url
            link.download = `sbom-analysis-${sbom.jobId}.txt`
            document.body.appendChild(link)
            link.click()

            document.body.removeChild(link)
            URL.revokeObjectURL(url)
        } catch (error) {
            const message = error.message || 'Failed to download analysis report'
            if (activeTab === 'upload') {
                setZipError(message)
            } else {
                setGithubError(message)
            }
        } finally {
            setReportLoading(false)
        }
    }

    const resetDashboard = () => {
        setSbom(null)
        setZipFile(null)
        setZipError('')
        setGithubUrl('')
        setGithubError('')
    }

    const switchToUpload = () => {
        setActiveTab('upload')
        setSbom(null)
        setGithubError('')
    }

    const switchToGithub = () => {
        setActiveTab('github')
        setSbom(null)
        setZipError('')
    }

    const handleLogout = () => {
        localStorage.removeItem('authToken')
        localStorage.removeItem('user')
        navigate('/login')
    }

    return (
        <div className="min-h-screen w-full bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col overflow-y-auto">
            <header className="bg-slate-800 border-b border-slate-700 shadow-lg flex-shrink-0">
                <div className="px-4 py-4 md:px-8 flex flex-col gap-4 md:flex-row md:justify-between md:items-center">
                    <div>
                        <h1 className="text-3xl font-bold text-white">SBOM Generator</h1>
                        <p className="text-slate-400 text-sm">
                            Welcome, <span className="text-blue-400 font-semibold">{user?.name}</span>
                        </p>
                    </div>

                    <div className="flex w-full flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between md:w-auto md:justify-end md:gap-4">
                        <div className="text-left sm:text-right">
                            <p className="text-slate-300 text-sm font-medium">Signed in as</p>
                            <p className="text-slate-400 text-xs">{user?.email}</p>
                        </div>

                        <button
                            onClick={handleLogout}
                            className="w-full px-6 py-2 sm:w-auto bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white rounded-lg transition-all active:scale-95 font-semibold"
                        >
                            Sign Out
                        </button>
                    </div>
                </div>
            </header>

            <main className="flex-1 overflow-visible px-4 py-6 md:px-8 md:py-8">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-7xl mx-auto">
                    <div className="lg:col-span-2 flex flex-col">
                        <div className="bg-slate-800 rounded-lg shadow-xl border border-slate-700 overflow-hidden flex-1 flex flex-col">
                            <div className="flex border-b border-slate-700">
                                <button
                                    onClick={switchToUpload}
                                    className={`flex-1 px-6 py-3 font-medium transition-colors ${activeTab === 'upload'
                                        ? 'bg-slate-700 text-blue-400 border-b-2 border-blue-500'
                                        : 'text-slate-400 hover:text-white'
                                        }`}
                                >
                                    Upload ZIP
                                </button>

                                <button
                                    onClick={switchToGithub}
                                    className={`flex-1 px-6 py-3 font-medium transition-colors ${activeTab === 'github'
                                        ? 'bg-slate-700 text-blue-400 border-b-2 border-blue-500'
                                        : 'text-slate-400 hover:text-white'
                                        }`}
                                >
                                    GitHub Link
                                </button>
                            </div>

                            <div className="p-6">
                                {activeTab === 'upload' && (
                                    <div className="space-y-4">
                                        <div className="border-2 border-dashed border-slate-600 rounded-lg p-8 text-center hover:border-blue-500 transition-colors">
                                            <input
                                                type="file"
                                                id="zipInput"
                                                accept=".zip"
                                                onChange={handleZipUpload}
                                                disabled={zipLoading}
                                                className="hidden"
                                            />

                                            <label htmlFor="zipInput" className="cursor-pointer block">
                                                <p className="text-white font-medium">
                                                    {zipFile ? zipFile.name : 'Click to upload a ZIP file'}
                                                </p>
                                                <p className="text-slate-400 text-sm mt-1">
                                                    {zipFile
                                                        ? `Size: ${(zipFile.size / 1024 / 1024).toFixed(2)} MB`
                                                        : 'Only .zip files are accepted'}
                                                </p>
                                            </label>
                                        </div>

                                        {zipError && (
                                            <div className="p-3 bg-red-900/20 border border-red-500/30 rounded-lg">
                                                <p className="text-red-300 text-sm">{zipError}</p>
                                            </div>
                                        )}

                                        {zipFile && (
                                            <button
                                                onClick={generateFromZip}
                                                disabled={sbomLoading}
                                                className="w-full py-3 px-4 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                                            >
                                                {sbomLoading ? 'Generating SBOM...' : 'Generate SBOM'}
                                            </button>
                                        )}
                                    </div>
                                )}

                                {activeTab === 'github' && (
                                    <div className="space-y-4">
                                        <div>
                                            <label htmlFor="github" className="block text-sm font-medium text-slate-300 mb-2">
                                                GitHub Repository URL
                                            </label>
                                            <input
                                                id="github"
                                                type="url"
                                                value={githubUrl}
                                                onChange={(event) => setGithubUrl(event.target.value)}
                                                placeholder="https://github.com/username/repository"
                                                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                                                disabled={sbomLoading}
                                            />
                                            <p className="text-slate-400 text-sm mt-2">Example: https://github.com/torvalds/linux</p>
                                        </div>

                                        {githubError && (
                                            <div className="p-3 bg-red-900/20 border border-red-500/30 rounded-lg">
                                                <p className="text-red-300 text-sm">{githubError}</p>
                                            </div>
                                        )}

                                        <button
                                            type="button"
                                            onClick={generateFromGithub}
                                            disabled={!githubUrl.trim() || sbomLoading}
                                            className="w-full py-3 px-4 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                                        >
                                            {sbomLoading ? 'Generating SBOM...' : 'Generate SBOM'}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="lg:col-span-1">
                        <div className="bg-slate-800 rounded-lg shadow-xl border border-slate-700 p-6 lg:sticky lg:top-6">
                            <h2 className="text-xl font-bold text-white mb-4">SBOM Results</h2>

                            {sbom ? (
                                <div className="space-y-4">
                                    <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-4">
                                        <p className="text-green-300 text-sm font-medium mb-2">SBOM generated</p>
                                        <p className="text-slate-300 text-xs">{sbom.message}</p>
                                    </div>

                                    <div className="bg-slate-700 rounded-lg p-4 space-y-2">
                                        <p className="text-slate-300 text-sm">
                                            <span className="font-medium text-slate-200">Format:</span> {sbomSummary.format}
                                        </p>
                                        <p className="text-slate-300 text-sm">
                                            <span className="font-medium text-slate-200">Components:</span> {sbomSummary.componentCount}
                                        </p>
                                        <p className="text-slate-300 text-sm">
                                            <span className="font-medium text-slate-200">Generated:</span>{' '}
                                            {sbomSummary.generatedAt ? new Date(sbomSummary.generatedAt).toLocaleString() : 'N/A'}
                                        </p>
                                    </div>

                                    {sbom.analysis && (
                                        <div className="bg-slate-700 rounded-lg p-4 space-y-2">
                                            <p className="text-slate-200 text-sm font-semibold">License Analysis</p>
                                            <p className="text-slate-300 text-sm">
                                                <span className="font-medium text-slate-200">Forbidden:</span> {sbom.analysis.licenses?.forbidden ?? 0}
                                            </p>
                                            <p className="text-slate-300 text-sm">
                                                <span className="font-medium text-slate-200">Restricted:</span> {sbom.analysis.licenses?.restricted ?? 0}
                                            </p>
                                            <p className="text-slate-300 text-sm">
                                                <span className="font-medium text-slate-200">Unknown:</span> {sbom.analysis.licenses?.unknown ?? 0}
                                            </p>
                                        </div>
                                    )}

                                    <button
                                        onClick={downloadSBOM}
                                        className="w-full py-3 px-4 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-semibold rounded-lg transition-all active:scale-95"
                                    >
                                        Download SBOM
                                    </button>

                                    <button
                                        onClick={downloadAnalysisReport}
                                        disabled={reportLoading}
                                        className="w-full py-3 px-4 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                                    >
                                        {reportLoading ? 'Preparing Report...' : 'Download Analysis Report'}
                                    </button>

                                    <button
                                        onClick={resetDashboard}
                                        className="w-full py-2 px-4 bg-slate-700 hover:bg-slate-600 text-slate-300 font-medium rounded-lg transition-all"
                                    >
                                        Generate Another
                                    </button>
                                </div>
                            ) : (
                                <div className="text-center py-8">
                                    <p className="text-slate-400 text-sm">Upload a ZIP file or enter a GitHub URL to generate an SBOM.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    )
}
