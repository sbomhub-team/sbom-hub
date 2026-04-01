import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { login } from '../api'

export default function Login() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    const navigate = useNavigate()

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError('')
        setLoading(true)

        try {
            const response = await login(email, password)
            localStorage.setItem('authToken', response.token)
            localStorage.setItem('user', JSON.stringify(response.user))
            navigate('/dashboard')
        } catch (err) {
            setError(err.message || 'Login failed. Please try again.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen w-full bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-start justify-center overflow-y-auto p-4 py-6 md:items-center md:py-4">
            <div className="w-full max-w-md my-auto">
                <div className="text-center mb-8">
                    <h1 className="text-4xl font-bold text-white mb-2">SBOM Generator</h1>
                    <p className="text-slate-400">Software Bill of Materials</p>
                </div>

                <div className="bg-slate-800 rounded-lg shadow-2xl p-8 border border-slate-700">
                    <h2 className="text-2xl font-bold text-white mb-6">Login</h2>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">
                                Email Address
                            </label>
                            <input
                                id="email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="user@example.com"
                                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                                required
                                disabled={loading}
                            />
                        </div>

                        <div>
                            <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-2">
                                Password
                            </label>
                            <input
                                id="password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                                required
                                disabled={loading}
                            />
                        </div>

                        {error && (
                            <div className="p-3 bg-red-900/20 border border-red-500/30 rounded-lg">
                                <p className="text-red-300 text-sm">{error}</p>
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-2 px-4 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                        >
                            {loading ? 'Logging in...' : 'Login'}
                        </button>
                    </form>

                    <div className="mt-6 pt-6 border-t border-slate-700">
                        <p className="text-slate-400 text-sm mb-2">Or create a new account</p>
                        <Link
                            to="/signup"
                            className="block w-full text-center px-4 py-2 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white rounded-lg transition-all active:scale-95 font-semibold"
                        >
                            Sign Up
                        </Link>
                        <Link
                            to="/"
                            className="mt-3 block w-full text-center px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg transition-all active:scale-95 font-semibold"
                        >
                            Back to Home
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    )
}
