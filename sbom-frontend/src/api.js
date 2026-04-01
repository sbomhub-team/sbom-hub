const defaultApiBase =
    window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? 'http://localhost:3001/api'
        : '/api'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || defaultApiBase

async function apiCall(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`
    const response = await fetch(url, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(options.headers || {})
        }
    })

    let payload = null
    try {
        payload = await response.json()
    } catch {
        payload = null
    }

    if (!response.ok) {
        const message = payload?.message || `Request failed with status ${response.status}`
        throw new Error(message)
    }

    return payload
}

export const signup = async (email, password, name) => {
    return apiCall('/auth/signup', {
        method: 'POST',
        body: JSON.stringify({ email, password, name })
    })
}

export const login = async (email, password) => {
    return apiCall('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
    })
}

export const generateSBOMFromGitHub = async (githubUrl) => {
    return apiCall('/sbom/github', {
        method: 'POST',
        body: JSON.stringify({ githubUrl })
    })
}

export const generateSBOMFromFile = async (fileName, fileSize, fileContent) => {
    return apiCall('/sbom/upload', {
        method: 'POST',
        body: JSON.stringify({ fileName, fileSize, fileContent })
    })
}

export const getSBOMJobStatus = async (jobId) => {
    return apiCall(`/sbom/job/${jobId}`, {
        method: 'GET'
    })
}

export const downloadSBOMAnalysisReport = async (jobId) => {
    const url = `${API_BASE_URL}/sbom/job/${jobId}/report.txt`
    const response = await fetch(url, { method: 'GET' })

    if (!response.ok) {
        let payload = null
        try {
            payload = await response.json()
        } catch {
            payload = null
        }

        const message = payload?.message || `Request failed with status ${response.status}`
        throw new Error(message)
    }

    return response.text()
}

export const generateSBOM = async (source, sourceType) => {
    if (sourceType === 'github') {
        return generateSBOMFromGitHub(source)
    }

    if (sourceType === 'file') {
        return generateSBOMFromFile(source.name, source.size, source.content)
    }

    throw new Error('Unsupported source type')
}

export const validateFile = async (file) => {
    return new Promise((resolve, reject) => {
        if (!(file.type === 'application/zip' || file.name.endsWith('.zip'))) {
            reject(new Error('Only ZIP files are supported'))
            return
        }

        const reader = new FileReader()
        reader.onload = (e) => {
            const arrayBuffer = e.target.result
            const bytes = new Uint8Array(arrayBuffer)
            const binaryString = bytes.reduce((acc, byte) => acc + String.fromCharCode(byte), '')
            const base64 = btoa(binaryString)

            resolve({
                fileName: file.name,
                size: file.size,
                content: base64
            })
        }
        reader.onerror = () => {
            reject(new Error('Failed to read file'))
        }
        reader.readAsArrayBuffer(file)
    })
}

export const validateGitHub = async (githubUrl) => {
    const githubRegex = /^https?:\/\/(www\.)?github\.com\/[\w-]+\/[\w-]+\/?$/
    if (!githubRegex.test(githubUrl)) {
        throw new Error('Invalid GitHub URL format. Use: https://github.com/username/repo')
    }

    return { url: githubUrl }
}
