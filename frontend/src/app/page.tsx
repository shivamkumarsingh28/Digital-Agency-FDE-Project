import Link from 'next/link';

const services = [
  ['Web development', 'Marketing sites and web apps built on Next.js, with the speed and accessibility checks done before launch.'],
  ['App development', 'Mobile and cross-platform apps with a proper backend, so they keep working as your user base grows.'],
  ['Content creation', 'Photos, copy and graphics made for your brand, planned around what your audience actually watches and reads.'],
  ['Video editing', 'Reels, long-form edits and ads, delivered in the formats each platform asks for.'],
  ['Social media management', 'Scheduling, community replies and monthly reports, handled by one named person on our team.'],
  ['Digital marketing', 'Search and paid campaigns with clear reporting on what each rupee or dollar returned.'],
];
const steps = [
  ['Discover', 'We learn your goals, audience and constraints in one working session.'],
  ['Plan', 'You get a scope, timeline and budget you can approve in the portal.'],
  ['Build', 'We deliver in small pieces, each one uploaded as a numbered version.'],
  ['Review', 'You approve or request changes on each deliverable, with comments attached to the work.'],
  ['Launch', 'We ship, measure and keep improving with a monthly retainer if you want one.'],
];

export default function Home() {
  return (
    <>
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <span className="font-display text-2xl font-extrabold text-indigo">Saiam</span>
        <nav className="flex items-center gap-5 text-sm font-medium">
          <a href="#services" className="hover:underline">Services</a>
          <a href="#process" className="hover:underline">How we work</a>
          <a href="#contact" className="hover:underline">Contact</a>
          <Link href="/login" className="btn btn-primary">Client portal</Link>
        </nav>
      </header>

      <section className="mx-auto grid max-w-6xl gap-12 px-5 pb-20 pt-12 lg:grid-cols-[1.15fr_1fr] lg:items-center">
        <div>
          <h1 className="text-5xl font-extrabold leading-[1.05] text-indigo sm:text-6xl">
            Websites, apps and video, approved in one place.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed">
            Saiam is a digital agency for brands that want fewer email threads and more finished work. Every file, comment, approval and invoice lives in your own branded portal.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="#contact" className="btn btn-accent !px-6 !py-3 !text-base">Book a project call</a>
            <a href="#services" className="btn btn-ghost !px-6 !py-3 !text-base">See what we build</a>
          </div>
        </div>

        {/* The portal's core moment, shown as the hero: one deliverable waiting for sign-off. */}
        <aside aria-label="Example deliverable in the client portal" className="rounded-2xl border border-line bg-white p-6 shadow-[0_18px_40px_-24px_rgba(30,42,90,0.45)]">
          <p className="text-sm text-slate2/70">Spring campaign · Acme Fitness</p>
          <h2 className="mt-1 text-2xl font-bold text-indigo">Homepage hero video</h2>
          <ol className="my-5 flex items-center gap-2 text-xs font-medium">
            {['Draft', 'Internal review', 'Your approval', 'Approved'].map((s, i) => (
              <li key={s} className="flex flex-1 flex-col gap-1">
                <span className={`h-1.5 rounded-full ${i <= 2 ? 'bg-saffron' : 'bg-line'}`} />
                <span className={i === 2 ? 'font-bold text-indigo' : 'text-slate2/70'}>{s}</span>
              </li>
            ))}
          </ol>
          <div className="rounded-lg bg-mist p-4 text-sm">
            <p className="font-semibold">hero_v2.mp4 · 00:24</p>
            <p className="mt-1">“Can the last shot hold two seconds longer?” <span className="text-slate2/70">Priya, 10:42</span></p>
          </div>
          <div className="mt-4 flex gap-2">
            <span className="btn btn-accent">Approve</span><span className="btn btn-ghost">Request changes</span>
          </div>
        </aside>
      </section>

      <section id="services" className="bg-white py-20">
        <div className="mx-auto max-w-6xl px-5">
          <h2 className="max-w-2xl text-4xl font-bold text-indigo">Everything a growing brand needs, from one team</h2>
          <dl className="mt-12 grid gap-x-12 gap-y-8 md:grid-cols-2">
            {services.map(([t, d]) => (
              <div key={t} className="border-l-4 border-saffron pl-5"><dt className="text-xl font-bold">{t}</dt><dd className="mt-1 leading-relaxed">{d}</dd></div>
            ))}
          </dl>
        </div>
      </section>

      <section id="process" className="mx-auto max-w-6xl px-5 py-20">
        <h2 className="text-4xl font-bold text-indigo">How a project runs</h2>
        <ol className="mt-10 grid gap-6 md:grid-cols-5">
          {steps.map(([t, d], i) => (
            <li key={t}><span className="font-display text-3xl font-extrabold text-saffron-deep">{i + 1}</span><h3 className="mt-1 text-lg font-bold">{t}</h3><p className="mt-1 text-sm leading-relaxed">{d}</p></li>
          ))}
        </ol>
      </section>

      <section id="contact" className="bg-indigo py-20 text-white">
        <div className="mx-auto max-w-6xl px-5">
          <h2 className="max-w-xl text-4xl font-bold">Tell us what you want to launch</h2>
          <p className="mt-4 max-w-xl text-lg text-white/80">Email a short brief and we will reply within one working day with questions and a rough timeline.</p>
          <a href="mailto:hello@saiam.agency" className="btn btn-accent mt-8 !px-6 !py-3 !text-base">hello@saiam.agency</a>
        </div>
      </section>
      <footer className="px-5 py-8 text-center text-sm">© {new Date().getFullYear()} Saiam Digital Agency</footer>
    </>
  );
}
