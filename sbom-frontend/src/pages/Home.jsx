export default function Home() {
    return (
        <div
            className="min-h-screen w-full bg-slate-950 bg-cover bg-center bg-fixed"
            style={{
                backgroundImage:
                    "linear-gradient(rgba(15, 23, 42, 0.72), rgba(15, 23, 42, 0.72)), url('https://images.unsplash.com/photo-1639322537228-f710d846310a?q=80&w=1800&auto=format&fit=crop')"
            }}
        >
            <main className="mx-auto w-[92vw] max-w-6xl py-6 md:py-8">
                <div className="mb-5 flex flex-wrap justify-end gap-2.5">
                    <a
                        href="/login"
                        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-slate-950/40 transition hover:bg-blue-700"
                    >
                        Login
                    </a>
                    <a
                        href="/signup"
                        className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-slate-950/40 transition hover:bg-green-700"
                    >
                        Sign Up
                    </a>
                    <a
                        href="https://github.com/sbomhub-team/sbom-hub"
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg border border-slate-500 bg-slate-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-slate-950/40 transition hover:bg-slate-700"
                    >
                        GitHub
                    </a>
                </div>

                <section className="rounded-2xl border border-slate-500/50 bg-slate-900/75 p-6 shadow-2xl shadow-slate-950/45 backdrop-blur-sm md:p-8">
                    <h1 className="mb-3 text-4xl font-bold text-white md:text-5xl">SBOM HUB</h1>
                    <p className="mb-8 max-w-4xl text-base leading-7 text-slate-200 md:text-lg">
                        SBOMHub is a cloud-based thesis project that explores automatic generation of Software Bills of Materials (SBOM).
                        It addresses the challenge that SBOM creation can be complex and different across technologies.
                        The prototype generates SBOMs automatically and provides them in SPDX JSON format.
                        It also analyzes the results and presents insights in a simple text format.
                        SBOM Hub also provides a CLI tool for terminal, enabling automated SBOM generation, analysis, and report download.
                        It is motivated by the EU Cyber Resilience Act (CRA), which will make SBOMs mandatory by 2027.
                    </p>

                    <div className="grid gap-4 md:grid-cols-2">
                        <article className="rounded-xl border border-slate-500/50 bg-slate-800/55 p-4">
                            <h2 className="mb-3 text-xl font-semibold text-white">Sbomhub Team:</h2>
                            <ul className="space-y-2 text-slate-200">
                                <li>Elahm Rastighahfarokhi</li>
                                <li>Mehdi Nourivahid</li>
                                <li>Mostafa Sharghi</li>
                                <li>Supervisor: Markku Niiranen</li>
                                <li>Technical Lead: Gergely Csatari</li>
                            </ul>
                        </article>

                        <article className="rounded-xl border border-slate-500/50 bg-slate-800/55 p-4">
                            <h2 className="mb-3 text-xl font-semibold text-white">Project Info</h2>
                            <p className="mb-2 text-slate-200">
                                <span className="font-semibold">Github link:</span>{' '}
                                <a
                                    href="https://github.com/sbomhub-team/sbom-hub"
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-sky-300 transition hover:text-sky-200 hover:underline"
                                >
                                    https://github.com/sbomhub-team/sbom-hub
                                </a>
                            </p>
                            <p className="text-slate-200">
                                <span className="font-semibold">Contact us:</span> sbomhub@gmail.com
                            </p>
                        </article>

                        <article className="rounded-xl border border-slate-500/50 bg-slate-800/55 p-4 md:col-span-2">
                            <h2 className="mb-3 text-xl font-semibold text-white">Connected Links</h2>
                            <ul className="space-y-2 text-slate-200">
                                <li>
                                    <a
                                        href="https://sbom-qa.org/"
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-sky-300 transition hover:text-sky-200 hover:underline"
                                    >
                                        Nokia-QA
                                    </a>
                                </li>
                                <li>
                                    <a
                                        href="https://github.com/spdx"
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-sky-300 transition hover:text-sky-200 hover:underline"
                                    >
                                        spdx
                                    </a>
                                </li>
                                <li>
                                    <a
                                        href="https://github.com/anchore/syft"
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-sky-300 transition hover:text-sky-200 hover:underline"
                                    >
                                        Syft
                                    </a>
                                </li>
                                <li>
                                    <a
                                        href="https://github.com/DependencyTrack"
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-sky-300 transition hover:text-sky-200 hover:underline"
                                    >
                                        OWASP
                                    </a>
                                </li>
                            </ul>
                        </article>
                    </div>
                </section>
            </main>
        </div>
    )
}
