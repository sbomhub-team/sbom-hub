import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { signup, login } from '../api'

export default function SignUp() {
    const [name, setName] = useState('')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    const [success, setSuccess] = useState(false)
    const navigate = useNavigate()

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError('')
        setLoading(true)

        if (!name.trim()) {
            setError('Name is required')
            setLoading(false)
            return
        }

        if (password !== confirmPassword) {
            setError('Passwords do not match')
            setLoading(false)
            return
        }

        if (password.length < 6) {
            setError('Password must be at least 6 characters')
            setLoading(false)
            return
        }

        try {
            await signup(email, password, name)
            setSuccess(true)

            setTimeout(async () => {
                try {
                    const response = await login(email, password)
                    localStorage.setItem('authToken', response.token)
                    localStorage.setItem('user', JSON.stringify(response.user))
                    navigate('/dashboard')
                } catch (err) {
                    setError(err.message || 'Login failed')
                }
            }, 1500)
        } catch (err) {
            setError(err.message || 'Sign up failed')
            setSuccess(false)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen w-full bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-start justify-center overflow-y-auto p-4 py-6 md:items-center md:py-4">
            <div className="w-full max-w-md my-auto">
                <div className="text-center mb-8">
                    <h1 className="text-4xl font-bold text-white mb-2">SBOM Generator</h1>
                    <p className="text-slate-400">Create an account to get started</p>
                </div>

                <div className="bg-slate-800 rounded-lg shadow-2xl p-8 border border-slate-700">
                    {success ? (
                        <div className="text-center space-y-4">
                            <h2 className="text-2xl font-bold text-green-400">Account Created!</h2>
                            <p className="text-slate-400">Redirecting to dashboard...</p>
                        </div>
                    ) : (
                        <>
                            <h2 className="text-2xl font-bold text-white mb-6">Sign Up</h2>

                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div>
                                    <label htmlFor="name" className="block text-sm font-medium text-slate-300 mb-2">
                                        Full Name
                                    </label>
                                    <input
                                        id="name"
                                        type="text"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        placeholder="John Doe"
                                        className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                                        required
                                        disabled={loading}
                                    />
                                </div>

                                <div>
                                    <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">
                                        Email Address
                                    </label>
                                    <input
                                        id="email"
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="john@example.com"
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

                                <div>
                                    <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-300 mb-2">
                                        Confirm Password
                                    </label>
                                    <input
                                        id="confirmPassword"
                                        type="password"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
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
                                    className="w-full py-2 px-4 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                                >
                                    {loading ? 'Creating Account...' : 'Create Account'}
                                </button>
                            </form>

                            <div className="mt-6 pt-6 border-t border-slate-700 text-center">
                                <p className="text-slate-400">Already have an account?</p>
                                <Link
                                    to="/login"
                                    className="text-blue-400 hover:text-blue-300 font-semibold transition-colors"
                                >
                                    Sign In
                                </Link>
                                <Link
                                    to="/"
                                    className="mt-4 block w-full text-center px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg transition-all active:scale-95 font-semibold"
                                >
                                    Back to Home
                                </Link>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}
