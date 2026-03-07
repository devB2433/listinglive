"use client";

import Link from "next/link";

import { useLocale } from "@/components/providers/locale-provider";

export default function HomePage() {
  const { locale, setLocale, translate } = useLocale();
  const benefits = [
    {
      title: translate("home.benefits.fastTitle"),
      description: translate("home.benefits.fastDescription"),
    },
    {
      title: translate("home.benefits.brandTitle"),
      description: translate("home.benefits.brandDescription"),
    },
    {
      title: translate("home.benefits.teamTitle"),
      description: translate("home.benefits.teamDescription"),
    },
  ];
  const steps = [
    {
      title: translate("home.howItWorks.uploadTitle"),
      description: translate("home.howItWorks.uploadDescription"),
    },
    {
      title: translate("home.howItWorks.generateTitle"),
      description: translate("home.howItWorks.generateDescription"),
    },
    {
      title: translate("home.howItWorks.publishTitle"),
      description: translate("home.howItWorks.publishDescription"),
    },
  ];
  const features = [
    {
      title: translate("home.features.shortVideoTitle"),
      description: translate("home.features.shortVideoDescription"),
    },
    {
      title: translate("home.features.longVideoTitle"),
      description: translate("home.features.longVideoDescription"),
    },
    {
      title: translate("home.features.logoTitle"),
      description: translate("home.features.logoDescription"),
    },
    {
      title: translate("home.features.billingTitle"),
      description: translate("home.features.billingDescription"),
    },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-6">
        <div>
          <p className="text-lg font-semibold">{translate("common.brand")}</p>
          <p className="text-sm text-slate-300">{translate("home.tagline")}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            {(["zh-CN", "en"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setLocale(value)}
                className={`rounded-full px-3 py-1 text-sm ${
                  locale === value ? "bg-white text-slate-950" : "border border-slate-600 text-slate-200"
                }`}
              >
                {value === "zh-CN" ? translate("common.chinese") : translate("common.english")}
              </button>
            ))}
          </div>
          <Link href="/login" className="rounded-full border border-slate-600 px-4 py-2 text-sm text-slate-100">
            {translate("home.login")}
          </Link>
        </div>
      </header>

      <main>
        <section className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-16 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
          <div>
            <div className="inline-flex rounded-full border border-blue-400/40 bg-blue-500/10 px-4 py-1 text-sm text-blue-200">
              {translate("home.heroBadge")}
            </div>
            <h1 className="mt-6 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
              {translate("home.heroTitle")}
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
              {translate("home.heroSubtitle")}
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/register?source=home-free-trial"
                className="rounded-full bg-blue-500 px-6 py-3 text-center text-sm font-medium text-white hover:bg-blue-400"
              >
                {translate("home.freeTrial")}
              </Link>
              <Link
                href="/login"
                className="rounded-full border border-slate-600 px-6 py-3 text-center text-sm font-medium text-slate-100 hover:bg-slate-900"
              >
                {translate("home.login")}
              </Link>
            </div>
            <p className="mt-3 text-sm text-slate-400">{translate("home.heroHint")}</p>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl shadow-blue-950/40">
            <p className="text-sm font-medium text-blue-200">{translate("home.previewBadge")}</p>
            <div className="mt-6 space-y-4">
              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                <p className="text-sm text-slate-400">{translate("home.previewCard.oneLabel")}</p>
                <p className="mt-2 text-lg font-medium">{translate("home.previewCard.oneTitle")}</p>
                <p className="mt-2 text-sm text-slate-300">{translate("home.previewCard.oneDescription")}</p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                <p className="text-sm text-slate-400">{translate("home.previewCard.twoLabel")}</p>
                <p className="mt-2 text-lg font-medium">{translate("home.previewCard.twoTitle")}</p>
                <p className="mt-2 text-sm text-slate-300">{translate("home.previewCard.twoDescription")}</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                  <p className="text-2xl font-semibold text-white">{translate("home.stats.fastValue")}</p>
                  <p className="mt-1 text-sm text-slate-400">{translate("home.stats.fastLabel")}</p>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                  <p className="text-2xl font-semibold text-white">{translate("home.stats.outputValue")}</p>
                  <p className="mt-1 text-sm text-slate-400">{translate("home.stats.outputLabel")}</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-slate-900 bg-slate-900/60">
          <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-16 md:grid-cols-3">
            {benefits.map((item) => (
              <div key={item.title} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-6">
                <h2 className="text-xl font-semibold text-white">{item.title}</h2>
                <p className="mt-3 text-sm leading-7 text-slate-300">{item.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-4 py-16">
          <div className="max-w-2xl">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-blue-200">{translate("home.howItWorks.kicker")}</p>
            <h2 className="mt-3 text-3xl font-semibold">{translate("home.howItWorks.title")}</h2>
            <p className="mt-4 text-base leading-8 text-slate-300">{translate("home.howItWorks.subtitle")}</p>
          </div>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {steps.map((step, index) => (
              <div key={step.title} className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
                <p className="text-sm text-blue-200">{translate("home.howItWorks.stepLabel", { value: index + 1 })}</p>
                <h3 className="mt-3 text-xl font-semibold">{step.title}</h3>
                <p className="mt-3 text-sm leading-7 text-slate-300">{step.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-4 py-16">
          <div className="max-w-2xl">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-blue-200">{translate("home.features.kicker")}</p>
            <h2 className="mt-3 text-3xl font-semibold">{translate("home.features.title")}</h2>
            <p className="mt-4 text-base leading-8 text-slate-300">{translate("home.features.subtitle")}</p>
          </div>
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            {features.map((feature) => (
              <div key={feature.title} className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
                <h3 className="text-xl font-semibold">{feature.title}</h3>
                <p className="mt-3 text-sm leading-7 text-slate-300">{feature.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-4 pb-20">
          <div className="rounded-3xl border border-blue-400/30 bg-blue-500/10 px-6 py-10 text-center">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-blue-200">{translate("home.finalCta.kicker")}</p>
            <h2 className="mt-3 text-3xl font-semibold">{translate("home.finalCta.title")}</h2>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-8 text-slate-200">{translate("home.finalCta.subtitle")}</p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Link
                href="/register?source=home-free-trial"
                className="rounded-full bg-white px-6 py-3 text-sm font-medium text-slate-950 hover:bg-slate-100"
              >
                {translate("home.freeTrial")}
              </Link>
              <Link
                href="/billing"
                className="rounded-full border border-slate-500 px-6 py-3 text-sm font-medium text-white hover:bg-slate-900"
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
