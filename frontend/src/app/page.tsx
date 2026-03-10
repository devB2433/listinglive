"use client";

import Link from "next/link";

import { useLocale } from "@/components/providers/locale-provider";

type ValueCard = {
  metric: string;
  title: string;
  description: string;
};

type PlanCard = {
  key: "basic" | "pro" | "ultimate";
  title: string;
  price: string;
  credits: string;
  summary: string;
  highlightOne: string;
  highlightTwo: string;
  badge: string;
};

type ComparisonRow = {
  label: string;
  basic: string;
  pro: string;
  ultimate: string;
};

export default function HomePage() {
  const { locale, setLocale, translate } = useLocale();
  const proofSourceUrl = "https://www.rollavideo.com/post/7-video-marketing-statistics-every-realtor-needs-to-know";

  const heroHighlights = [
    translate("home.heroHighlights.one"),
    translate("home.heroHighlights.two"),
    translate("home.heroHighlights.three"),
  ];

  const heroSteps = [
    translate("home.heroPanel.stepOne"),
    translate("home.heroPanel.stepTwo"),
    translate("home.heroPanel.stepThree"),
  ];

  const valueCards: ValueCard[] = [
    {
      metric: translate("home.values.fastMetric"),
      title: translate("home.values.fastTitle"),
      description: translate("home.values.fastDescription"),
    },
    {
      metric: translate("home.values.templatesMetric"),
      title: translate("home.values.templatesTitle"),
      description: translate("home.values.templatesDescription"),
    },
    {
      metric: translate("home.values.qualityMetric"),
      title: translate("home.values.qualityTitle"),
      description: translate("home.values.qualityDescription"),
    },
  ];

  const planCards: PlanCard[] = [
    {
      key: "basic",
      title: translate("home.plans.basic.title"),
      price: translate("home.plans.basic.price"),
      credits: translate("home.plans.basic.credits"),
      summary: translate("home.plans.basic.summary"),
      highlightOne: translate("home.plans.basic.highlightOne"),
      highlightTwo: translate("home.plans.basic.highlightTwo"),
      badge: translate("home.plans.basic.badge"),
    },
    {
      key: "pro",
      title: translate("home.plans.pro.title"),
      price: translate("home.plans.pro.price"),
      credits: translate("home.plans.pro.credits"),
      summary: translate("home.plans.pro.summary"),
      highlightOne: translate("home.plans.pro.highlightOne"),
      highlightTwo: translate("home.plans.pro.highlightTwo"),
      badge: translate("home.plans.pro.badge"),
    },
    {
      key: "ultimate",
      title: translate("home.plans.ultimate.title"),
      price: translate("home.plans.ultimate.price"),
      credits: translate("home.plans.ultimate.credits"),
      summary: translate("home.plans.ultimate.summary"),
      highlightOne: translate("home.plans.ultimate.highlightOne"),
      highlightTwo: translate("home.plans.ultimate.highlightTwo"),
      badge: translate("home.plans.ultimate.badge"),
    },
  ];

  const comparisonRows: ComparisonRow[] = [
    {
      label: translate("home.plans.rows.monthlyCredits"),
      basic: translate("home.plans.basic.credits"),
      pro: translate("home.plans.pro.credits"),
      ultimate: translate("home.plans.ultimate.credits"),
    },
    {
      label: translate("home.plans.rows.clipLength"),
      basic: translate("home.plans.basic.highlightOne"),
      pro: translate("home.plans.pro.highlightOne"),
      ultimate: translate("home.plans.ultimate.highlightOne"),
    },
    {
      label: translate("home.plans.rows.editing"),
      basic: translate("home.plans.basic.highlightTwo"),
      pro: translate("home.plans.pro.highlightTwo"),
      ultimate: translate("home.plans.ultimate.highlightTwo"),
    },
    {
      label: translate("home.plans.rows.bestFor"),
      basic: translate("home.plans.basic.summary"),
      pro: translate("home.plans.pro.summary"),
      ultimate: translate("home.plans.ultimate.summary"),
    },
  ];

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-50 text-slate-950">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[34rem] bg-[radial-gradient(circle_at_top_left,_rgba(37,99,235,0.22),_transparent_38%),radial-gradient(circle_at_top_right,_rgba(56,189,248,0.18),_transparent_30%),linear-gradient(180deg,_rgba(255,255,255,0.9),_rgba(248,250,252,0.96))]" />
      <div className="pointer-events-none absolute right-[8%] top-28 h-56 w-56 rounded-full bg-cyan-300/20 blur-3xl" />
      <div className="pointer-events-none absolute left-1/2 top-[30rem] h-80 w-80 -translate-x-1/2 rounded-full bg-blue-300/20 blur-3xl" />

      <header className="relative mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-6">
        <div>
          <p className="text-lg font-semibold tracking-tight text-slate-950">{translate("common.brand")}</p>
          <p className="text-sm text-slate-600">{translate("home.tagline")}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            {(["zh-CN", "en"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setLocale(value)}
                className={`rounded-full px-3 py-1 text-sm ${
                  locale === value
                    ? "border border-slate-900 bg-slate-950 text-white shadow-[0_10px_30px_rgba(15,23,42,0.18)]"
                    : "border border-slate-300/90 bg-white/70 text-slate-600 backdrop-blur hover:border-blue-300 hover:text-slate-800"
                }`}
              >
                {value === "zh-CN" ? translate("common.chinese") : translate("common.english")}
              </button>
            ))}
          </div>
          <Link
            href="/login"
            className="rounded-full border border-slate-300/90 bg-white/70 px-4 py-2 text-sm text-slate-700 backdrop-blur transition hover:border-blue-300 hover:bg-white"
          >
            {translate("home.login")}
          </Link>
        </div>
      </header>

      <main className="relative">
        <section className="mx-auto w-full max-w-7xl px-4 pb-20 pt-10 lg:pt-16">
          <div className="mx-auto max-w-6xl text-center">
            <p
              className="overflow-visible bg-[linear-gradient(135deg,rgba(15,23,42,1),rgba(29,78,216,0.92),rgba(15,23,42,0.92))] bg-clip-text px-2 pb-3 font-serif text-4xl font-semibold italic leading-[1.15] text-transparent sm:text-5xl lg:text-7xl"
            >
              {translate("home.slogan")}
            </p>
          </div>

          <div className="mt-16 grid gap-14 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
            <div>
              <h1 className="max-w-4xl text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
                {translate("home.heroTitle")}
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600 sm:text-xl">{translate("home.heroSubtitle")}</p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/register?source=home-free-trial"
                  className="rounded-full bg-slate-950 px-7 py-3.5 text-center text-sm font-medium text-white shadow-[0_18px_40px_rgba(15,23,42,0.18)] transition hover:-translate-y-0.5 hover:bg-blue-700"
                >
                  {translate("home.freeTrial")}
                </Link>
                <Link
                  href="#plans"
                  className="rounded-full border border-blue-300/70 bg-white/80 px-7 py-3.5 text-center text-sm font-medium text-blue-700 shadow-[0_12px_30px_rgba(37,99,235,0.08)] backdrop-blur transition hover:-translate-y-0.5 hover:border-blue-400 hover:bg-blue-50/80"
                >
                  {translate("home.viewPlans")}
                </Link>
              </div>
              <div className="mt-8 flex flex-wrap gap-3 text-sm text-slate-600">
                {heroHighlights.map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-slate-300/80 bg-white/75 px-4 py-2 shadow-[0_10px_24px_rgba(15,23,42,0.05)] backdrop-blur"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>

            <div className="lg:pt-1">
              <div className="rounded-[2rem] border border-slate-300/70 bg-white/70 p-7 shadow-[0_24px_80px_rgba(37,99,235,0.10)] backdrop-blur-xl">
                <div className="flex items-center justify-between text-sm text-slate-600">
                  <p>{translate("home.heroPanel.kicker")}</p>
                  <p className="rounded-full border border-blue-300/70 bg-blue-50/80 px-3 py-1 text-xs text-blue-700">
                    {translate("home.heroPanel.badge")}
                  </p>
                </div>
                <div className="mt-6 grid gap-3">
                  {heroSteps.map((step, index) => (
                    <div
                      key={step}
                      className="rounded-2xl border border-slate-300/70 bg-gradient-to-br from-white to-slate-50 p-4 shadow-[0_14px_35px_rgba(15,23,42,0.05)]"
                    >
                      <p className="text-xs uppercase tracking-[0.18em] text-blue-700">
                        {translate("home.heroPanel.stepLabel", { value: index + 1 })}
                      </p>
                      <p className="mt-2 text-lg font-medium text-slate-950">{step}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl border border-slate-300/70 bg-white/80 p-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
                    <p className="text-2xl font-semibold text-slate-950">{translate("home.stats.fastValue")}</p>
                    <p className="mt-1 text-sm text-slate-600">{translate("home.stats.fastLabel")}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-300/70 bg-white/80 p-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
                    <p className="text-2xl font-semibold text-slate-950">{translate("home.stats.outputValue")}</p>
                    <p className="mt-1 text-sm text-slate-600">{translate("home.stats.outputLabel")}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="px-4 py-10">
          <div className="mx-auto grid w-full max-w-7xl gap-8 rounded-[2rem] border border-slate-300/70 bg-gradient-to-r from-slate-100 via-white to-blue-50/70 px-6 py-10 shadow-[0_18px_50px_rgba(15,23,42,0.05)] lg:grid-cols-[0.7fr_1.3fr] lg:items-center lg:px-10">
            <div className="text-center lg:text-left">
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-blue-700">{translate("home.proof.kicker")}</p>
              <div className="mt-4 flex items-end justify-center gap-3 lg:justify-start">
                <p className="text-6xl font-semibold tracking-tight text-slate-950 sm:text-7xl">{translate("home.proof.statValue")}</p>
                <p className="pb-2 text-sm uppercase tracking-[0.18em] text-slate-600">{translate("home.proof.statLabel")}</p>
              </div>
            </div>
            <div>
              <h2 className="max-w-3xl text-2xl font-semibold sm:text-3xl">{translate("home.proof.title")}</h2>
              <p className="mt-4 max-w-2xl text-base leading-8 text-slate-600">{translate("home.proof.detail")}</p>
              <p className="mt-4 inline-flex rounded-full border border-slate-300/70 bg-white/80 px-4 py-2 text-sm text-slate-600 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
                {translate("home.proof.source")}{" "}
                <a href={proofSourceUrl} target="_blank" rel="noreferrer" className="ml-1 text-blue-700 underline underline-offset-2">
                  {translate("home.proof.sourceLinkLabel")}
                </a>
              </p>
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-7xl px-4 py-16">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{translate("home.values.title")}</h2>
          </div>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {valueCards.map((item) => (
              <div
                key={item.title}
                className="rounded-[1.75rem] border border-slate-300/70 bg-white/80 p-7 shadow-[0_18px_50px_rgba(15,23,42,0.05)] backdrop-blur transition hover:-translate-y-1 hover:border-blue-300"
              >
                <p className="text-sm font-medium uppercase tracking-[0.15em] text-blue-700">{item.metric}</p>
                <h3 className="mt-4 text-2xl font-semibold tracking-tight">{item.title}</h3>
                <p className="mt-3 text-sm leading-7 text-slate-600">{item.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="plans" className="mx-auto w-full max-w-7xl px-4 py-16">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{translate("home.plans.title")}</h2>
            <p className="mt-4 text-base text-slate-600 lg:max-w-none lg:whitespace-nowrap">{translate("home.plans.subtitle")}</p>
          </div>
          <div className="mt-10 overflow-x-auto rounded-[2rem] border border-slate-300/70 bg-white/80 shadow-[0_18px_50px_rgba(15,23,42,0.05)] backdrop-blur">
            <div className="min-w-[960px]">
              <div className="grid grid-cols-[1.15fr_repeat(3,minmax(0,1fr))] border-b border-slate-300/70 bg-slate-100/70">
                <div className="px-6 py-6" />
                {planCards.map((plan) => (
                  <div
                    key={plan.key}
                    className={`px-6 py-6 ${
                      plan.key === "pro" ? "border-x border-blue-300/70 bg-blue-50/70" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-2xl font-semibold text-slate-950">{plan.title}</p>
                        <p className="mt-2 text-sm text-slate-500">{plan.price}</p>
                      </div>
                      <span
                        className={`rounded-full px-3 py-1 text-xs ${
                          plan.key === "pro"
                            ? "border border-blue-600 bg-blue-600 text-white"
                            : "border border-slate-300/70 bg-white text-blue-700"
                        }`}
                      >
                        {plan.badge}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {comparisonRows.map((row, index) => (
                <div
                  key={row.label}
                  className={`grid grid-cols-[1.15fr_repeat(3,minmax(0,1fr))] ${
                    index !== comparisonRows.length - 1 ? "border-b border-slate-200/80" : ""
                  }`}
                >
                  <div className="px-6 py-5 text-sm font-medium text-slate-600">{row.label}</div>
                  <div className="px-6 py-5 text-sm leading-7 text-slate-800">{row.basic}</div>
                  <div className="border-x border-blue-200/80 bg-blue-50/40 px-6 py-5 text-sm leading-7 text-slate-900">
                    {row.pro}
                  </div>
                  <div className="px-6 py-5 text-sm leading-7 text-slate-800">{row.ultimate}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 rounded-[1.75rem] border border-blue-200/80 bg-[linear-gradient(135deg,rgba(239,246,255,0.96),rgba(255,255,255,0.92))] px-6 py-5 shadow-[0_14px_35px_rgba(37,99,235,0.08)]">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-700">
              {translate("home.plans.addonTitle")}
            </p>
            <p className="mt-2 text-sm leading-7 text-slate-700">{translate("home.plans.addonDetail")}</p>
          </div>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/register?source=home-free-trial"
              className="rounded-full bg-slate-950 px-7 py-3.5 text-center text-sm font-medium text-white transition hover:-translate-y-0.5 hover:bg-slate-800"
            >
              {translate("home.freeTrial")}
            </Link>
            <Link
              href="#plans"
              className="rounded-full border border-blue-300/70 bg-white/80 px-7 py-3.5 text-center text-sm font-medium text-blue-700 backdrop-blur transition hover:-translate-y-0.5 hover:border-blue-400 hover:bg-blue-50/80"
            >
              {translate("home.viewPlans")}
            </Link>
            <Link
              href="/login"
              className="rounded-full border border-slate-300/90 bg-white/80 px-7 py-3.5 text-center text-sm font-medium text-slate-700 backdrop-blur transition hover:-translate-y-0.5 hover:border-blue-300 hover:bg-white"
            >
              {translate("home.login")}
            </Link>
          </div>
          <p className="mt-3 text-sm text-slate-500">{translate("home.plans.note")}</p>
        </section>

        <section className="mx-auto w-full max-w-7xl px-4 pb-24 pt-6">
          <div className="rounded-[2rem] border border-slate-700/60 bg-[linear-gradient(135deg,rgba(15,23,42,1),rgba(30,41,59,1),rgba(29,78,216,0.92))] px-6 py-12 text-center text-white shadow-[0_30px_90px_rgba(15,23,42,0.24)]">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-blue-100">{translate("home.finalCta.kicker")}</p>
            <h2 className="mt-3 text-3xl font-semibold">{translate("home.finalCta.title")}</h2>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-8 text-slate-200">{translate("home.finalCta.subtitle")}</p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Link
                href="/register?source=home-free-trial"
                className="rounded-full bg-white px-7 py-3.5 text-sm font-medium text-slate-950 shadow-[0_14px_35px_rgba(255,255,255,0.18)] transition hover:-translate-y-0.5 hover:bg-blue-50"
              >
                {translate("home.freeTrial")}
              </Link>
              <Link
                href="#plans"
                className="rounded-full border border-white/20 bg-white/5 px-7 py-3.5 text-sm font-medium text-white backdrop-blur transition hover:-translate-y-0.5 hover:bg-white/10"
              >
                {translate("home.viewPlans")}
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
