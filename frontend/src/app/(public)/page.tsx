"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Clock, Tv, Layers, Menu, X, Globe, Zap, Sparkles, MonitorPlay, TrendingUp, ExternalLink, ArrowRight, ArrowDown, Check } from "lucide-react";

import { ScrollReveal } from "@/components/ScrollReveal";
import { useLocale } from "@/components/providers/locale-provider";
import { getPosts } from "@/lib/blog-posts-meta";

function ProofCountUp({ target = 403, suffix = "%", className = "" }: { target?: number; suffix?: string; className?: string }) {
  const [value, setValue] = useState(0);
  const ref = useRef<HTMLParagraphElement>(null);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!ref.current) return;

    const el = ref.current;
    const duration = 1000;

    const stopAnimation = () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };

    const startAnimation = () => {
      stopAnimation();
      setValue(0);
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min((now - start) / duration, 1);
        const easeOut = 1 - (1 - t) ** 2;
        setValue(Math.round(easeOut * target));
        if (t < 1) {
          frameRef.current = requestAnimationFrame(step);
        } else {
          frameRef.current = null;
        }
      };
      frameRef.current = requestAnimationFrame(step);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          startAnimation();
        } else {
          stopAnimation();
          setValue(0);
        }
      },
      { threshold: 0.2 }
    );
    observer.observe(el);

    return () => {
      observer.disconnect();
      stopAnimation();
    };
  }, [target]);

  return (
    <p ref={ref} className={`text-6xl font-extrabold leading-none sm:text-7xl md:text-8xl ${className}`}>
      {value}
      {suffix}
    </p>
  );
}

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

export default function HomePage() {
  const { locale, setLocale, translate } = useLocale();
  const proofSourceUrl = "https://www.rollavideo.com/post/7-video-marketing-statistics-every-realtor-needs-to-know";

  const heroHighlights = [
    translate("home.heroHighlights.one"),
    translate("home.heroHighlights.two"),
    translate("home.heroHighlights.three"),
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

  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled ? "glass shadow-card py-3" : "bg-transparent py-5"
        }`}
      >
        <div className="container flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand-mark.svg?v=2" alt="ListingLive" className="h-8 w-8 rounded-lg object-contain shrink-0" />
            <span className="text-lg font-bold text-foreground">{translate("common.brand")}</span>
          </Link>
          <nav className="hidden md:flex items-center gap-2">
            <Link href="/blog" className="rounded-lg px-3 py-2 text-sm font-semibold text-foreground hover:bg-accent/10 hover:text-accent transition-colors">
              {translate("blog.navTitle")}
            </Link>
            <div className="flex rounded-lg border border-border bg-card/50 p-0.5" role="group" aria-label="Language">
              <button type="button" onClick={() => setLocale("en")} className={`rounded-md px-3 py-1.5 text-sm font-medium ${locale === "en" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                EN
              </button>
              <button type="button" onClick={() => setLocale("zh-CN")} className={`rounded-md px-3 py-1.5 text-sm font-medium ${locale === "zh-CN" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                中文
              </button>
            </div>
            <Link href="/login" className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground hover:bg-secondary transition-colors">
              {translate("home.login")}
            </Link>
            <Link href="/register?source=home-nav" className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold shadow-card hover:opacity-90 hover:-translate-y-0.5 transition-all">
              {translate("home.freeTrial")}
            </Link>
          </nav>
          <button type="button" className="md:hidden p-2 rounded-lg hover:bg-secondary transition-colors" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Menu">
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
        {mobileOpen && (
          <div className="md:hidden glass mt-2 mx-4 rounded-xl p-4 shadow-card animate-fade-in">
            <div className="flex flex-col gap-2">
              <Link href="/blog" className="rounded-lg px-3 py-2 text-sm font-semibold" onClick={() => setMobileOpen(false)}>{translate("blog.navTitle")}</Link>
              <Link href="/login" className="rounded-lg px-3 py-2 text-sm font-semibold" onClick={() => setMobileOpen(false)}>{translate("home.login")}</Link>
              <Link href="/register?source=home-nav" className="rounded-lg px-3 py-2 text-sm font-semibold bg-primary text-primary-foreground" onClick={() => setMobileOpen(false)}>{translate("home.freeTrial")}</Link>
            </div>
          </div>
        )}
      </header>

      <main>
        <section className="relative overflow-hidden bg-gradient-hero pt-32 pb-20 md:pt-44 md:pb-28">
          <div className="absolute top-20 right-0 w-96 h-96 bg-accent/5 rounded-full blur-3xl -z-10" />
          <div className="absolute bottom-0 left-0 w-80 h-80 bg-primary-glow/5 rounded-full blur-3xl -z-10" />
          <div className="container">
            <ScrollReveal>
              <h1 className="text-center max-w-5xl mx-auto mb-8">
                <span className="block text-5xl md:text-6xl lg:text-7xl font-serif italic bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 bg-clip-text text-transparent leading-tight">
                  {translate("home.slogan")}
                </span>
              </h1>
            </ScrollReveal>
            <ScrollReveal delay={200}>
              <p className="text-xl md:text-2xl text-foreground/70 text-center max-w-2xl md:max-w-none md:whitespace-nowrap mx-auto mb-10">
                {translate("home.heroSubtitle")}
              </p>
            </ScrollReveal>
            <ScrollReveal delay={300}>
              <div className="flex flex-wrap items-center justify-center gap-4 mb-2">
                <Link href="/register?source=home-free-trial" className="rounded-lg bg-primary text-primary-foreground px-8 py-3.5 text-base font-semibold shadow-card hover:opacity-90 hover:-translate-y-0.5 transition-all">
                  {translate("home.freeTrial")}
                </Link>
                <Link href="#plans" className="rounded-lg border-2 border-border bg-card px-8 py-3.5 text-base font-semibold text-foreground hover:border-primary/30 hover:bg-secondary hover:-translate-y-0.5 transition-all">
                  {translate("home.viewPlans")}
                </Link>
              </div>
              <p className="text-center text-xs text-muted-foreground mb-12">
                {translate("home.freeTrialNote")}
              </p>
            </ScrollReveal>
            <ScrollReveal delay={400}>
              <div className="flex flex-wrap items-center justify-center gap-3 mb-16">
                {[Clock, Layers, Tv].map((Icon, i) => (
                  <div key={i} className="flex items-center gap-2 px-4 py-2 rounded-full bg-card/80 border border-border shadow-card text-sm text-muted-foreground">
                    <Icon className="w-4 h-4 text-accent" />
                    {heroHighlights[i]}
                  </div>
                ))}
              </div>
            </ScrollReveal>
            <div className="max-w-[84rem] mx-auto">
              <ScrollReveal delay={300}>
                <div className="w-full rounded-2xl overflow-hidden shadow-elegant bg-card border border-border">
                  <div className="grid grid-cols-1 md:grid-cols-[1fr_4rem_2fr] gap-0">
                    <div className="relative bg-gradient-to-br from-slate-100 via-slate-50 to-slate-100 p-6 md:p-8 flex flex-col min-h-[420px] md:min-h-[480px]">
                      <p className="text-center text-sm font-semibold text-foreground mb-4">
                        {translate("home.heroDemo.provideLabel")}
                      </p>
                      <div className="relative flex-1 w-full min-h-[320px] md:min-h-[380px]">
                        {[
                          { src: "/media/pic/1.jpg", className: "left-0 top-0 -rotate-6 z-[1] w-36 h-44 md:w-44 md:h-52 md:left-0 md:top-0" },
                          { src: "/media/pic/2.jpg", className: "left-0 bottom-0 rotate-2 z-[2] w-36 h-44 md:w-44 md:h-56 md:left-0 md:bottom-0" },
                          { src: "/media/pic/3.jpg", className: "right-0 top-1/2 -translate-y-1/2 -rotate-3 z-[3] w-40 h-48 md:w-52 md:h-64 md:right-0 md:top-1/2 md:-translate-y-1/2" },
                        ].map(({ src, className }) => (
                          <div
                            key={src}
                            className={`absolute rounded-xl overflow-hidden shadow-xl border-2 border-white ${className}`}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={src} alt="" className="w-full h-full object-cover" />
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="flex md:hidden items-center justify-center py-3 bg-gradient-to-b from-slate-50 to-blue-50/50">
                      <span className="animate-arrow-down inline-block">
                        <ArrowDown className="w-8 h-8 text-accent shrink-0" aria-hidden />
                      </span>
                    </div>
                    <div className="hidden md:flex items-center justify-center bg-gradient-to-r from-slate-50 to-blue-50/50">
                      <span className="animate-arrow-right inline-block">
                        <ArrowRight className="w-10 h-10 text-accent shrink-0" aria-hidden />
                      </span>
                    </div>
                    <div className="relative bg-gradient-to-br from-blue-50 via-indigo-50/50 to-purple-50 p-6 md:p-8 flex flex-col min-h-[420px] md:min-h-[480px]">
                      <p className="text-center text-sm font-semibold text-foreground mb-4">
                        {translate("home.heroDemo.getLabel")}
                      </p>
                      <div className="flex-1 flex items-center justify-center p-4">
                        <div className="w-full max-w-3xl aspect-video rounded-xl bg-slate-900 shadow-2xl overflow-hidden">
                          <video src="/media/video/listinglive-example.mp4" className="w-full h-full object-cover" autoPlay muted loop playsInline aria-label="Example output" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </ScrollReveal>
            </div>
          </div>
        </section>

        <section className="section-padding bg-gradient-cta relative overflow-hidden">
          <div className="absolute top-0 right-0 w-80 h-80 bg-accent/10 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-60 h-60 bg-primary-glow/10 rounded-full blur-3xl" />
          <div className="container relative z-10">
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <ScrollReveal>
                <div className="text-center md:text-left">
                  <span className="text-xs font-semibold tracking-widest text-accent uppercase mb-4 block">
                    {translate("home.proof.kicker")}
                  </span>
                  <div className="flex items-baseline gap-2 justify-center md:justify-start">
                    <ProofCountUp target={403} suffix="%" className="text-primary-foreground" />
                    <TrendingUp className="w-8 h-8 text-accent ml-1" />
                  </div>
                  <p className="text-xl font-semibold text-primary-foreground/80 mt-3">
                    {translate("home.proof.statLabel")}
                  </p>
                </div>
              </ScrollReveal>
              <ScrollReveal delay={200}>
                <div>
                  <h2 className="text-2xl md:text-3xl font-bold text-primary-foreground mb-4 leading-snug">
                    {translate("home.proof.title")}
                  </h2>
                  <p className="text-base text-primary-foreground/60 mb-6 leading-relaxed">
                    {translate("home.proof.detail")}
                  </p>
                  <a href={proofSourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-medium text-accent hover:opacity-80 transition-colors">
                    {translate("home.proof.source")} {translate("home.proof.sourceLinkLabel")}
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </ScrollReveal>
            </div>
          </div>
        </section>

        <section className="section-padding bg-gradient-subtle">
          <div className="container">
            <ScrollReveal>
              <div className="text-center mb-16">
                <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
                  {translate("home.values.title")}
                </h2>
              </div>
            </ScrollReveal>
            <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
              {[
                { icon: Zap, badge: valueCards[0].metric, title: valueCards[0].title, description: valueCards[0].description, color: "text-gold", bg: "bg-gold/10" },
                { icon: Sparkles, badge: valueCards[1].metric, title: valueCards[1].title, description: valueCards[1].description, color: "text-accent", bg: "bg-accent/10" },
                { icon: MonitorPlay, badge: valueCards[2].metric, title: valueCards[2].title, description: valueCards[2].description, color: "text-primary-glow", bg: "bg-primary-glow/10" },
              ].map((feature, i) => (
                <ScrollReveal key={feature.title} delay={i * 150}>
                  <div className="group bg-gradient-to-br from-card to-muted/20 rounded-2xl shadow-card border border-border p-8 hover:shadow-card-hover hover:-translate-y-2 hover:border-accent/20 transition-all duration-300 h-full">
                    <div className={`w-12 h-12 rounded-xl ${feature.bg} flex items-center justify-center mb-5 group-hover:scale-110 transition-transform`}>
                      <feature.icon className={`w-6 h-6 ${feature.color}`} />
                    </div>
                    <span className={`text-xs font-bold tracking-wider ${feature.color}`}>{feature.badge}</span>
                    <h3 className="text-xl font-bold text-foreground mt-2 mb-3">{feature.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
                  </div>
                </ScrollReveal>
              ))}
            </div>
          </div>
        </section>

        <section id="plans" className="section-padding bg-gradient-to-b from-background via-muted/30 to-background relative overflow-hidden">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-accent/5 rounded-full blur-3xl" />
          <div className="container">
            <ScrollReveal>
              <div className="text-center mb-16">
                <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">{translate("home.plans.title")}</h2>
                <p className="text-muted-foreground max-w-xl mx-auto">{translate("home.plans.subtitle")}</p>
              </div>
            </ScrollReveal>
            <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
              {planCards.map((plan, i) => (
                <ScrollReveal key={plan.key} delay={i * 150}>
                  <div
                    className={`relative rounded-2xl border p-8 h-full flex flex-col transition-all duration-300 ${
                      plan.key === "pro"
                        ? "bg-gradient-to-b from-card to-accent/[0.02] border-accent/40 shadow-[0_0_40px_rgba(59,130,246,0.15)] scale-[1.05] z-10 hover:shadow-[0_0_60px_rgba(59,130,246,0.25)]"
                        : "bg-card border-border shadow-card hover:shadow-card-hover hover:-translate-y-1"
                    }`}
                  >
                    {plan.key === "pro" ? (
                      <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-accent text-accent-foreground text-xs font-bold">
                        {plan.badge}
                      </div>
                    ) : (
                      <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-secondary text-muted-foreground text-xs font-semibold border border-border">
                        {plan.badge}
                      </div>
                    )}
                    <div className="text-center mb-6 mt-2">
                      <h3 className="text-xl font-bold text-foreground">{plan.title}</h3>
                      <p className="mt-3 text-sm text-muted-foreground">{plan.price}</p>
                    </div>
                    <div className="flex-1 space-y-4 mb-8">
                      {[plan.credits, plan.highlightOne, plan.highlightTwo, plan.summary].map((feature) => (
                        <div key={feature} className="flex items-start gap-3">
                          <div className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center mt-0.5 ${plan.key === "pro" ? "bg-accent/15 text-accent" : "bg-secondary text-muted-foreground"}`}>
                            <Check className="w-3 h-3" />
                          </div>
                          <span className="text-sm text-muted-foreground">{feature}</span>
                        </div>
                      ))}
                    </div>
                    <Link
                      href="/register?source=home-free-trial"
                      className={`w-full rounded-xl py-3 text-center text-sm font-semibold transition-all ${
                        plan.key === "pro"
                          ? "bg-primary text-primary-foreground hover:opacity-90 shadow-card"
                          : "border-2 border-border bg-card hover:bg-secondary hover:border-primary/20"
                      }`}
                    >
                      {translate("home.freeTrial")}
                    </Link>
                  </div>
                </ScrollReveal>
              ))}
            </div>
            <ScrollReveal delay={400}>
              <div className="mt-12 text-center">
                <div className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-card shadow-card border border-border">
                  <span className="text-xs font-bold tracking-wider text-accent">{translate("home.plans.addonTitle")}</span>
                  <span className="text-xs text-muted-foreground">·</span>
                  <span className="text-sm text-muted-foreground">{translate("home.plans.addonDetail")}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-3">{translate("home.plans.note")}</p>
              </div>
            </ScrollReveal>
          </div>
        </section>

        <section className="section-padding bg-gradient-subtle">
          <div className="container">
            <div className="rounded-2xl border border-border bg-card shadow-card p-8 max-w-2xl mx-auto">
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-accent">
                {translate("blog.fromTheBlogKicker")}
              </p>
              <h2 className="mt-3 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                {translate("blog.fromTheBlogTitle")}
              </h2>
              <ul className="mt-4 space-y-2">
                {getPosts().slice(0, 3).map((post) => (
                  <li key={post.slug}>
                    <Link href={`/blog/${post.slug}`} className="text-muted-foreground underline-offset-2 hover:text-accent hover:underline">
                      {post.title}
                    </Link>
                  </li>
                ))}
              </ul>
              <Link href="/blog" className="mt-4 inline-flex rounded-lg border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-secondary transition-colors">
                {translate("blog.readMore")}
              </Link>
            </div>
          </div>
        </section>

        <section className="section-padding bg-gradient-cta relative overflow-hidden">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-accent/5 rounded-full blur-3xl" />
          <div className="container relative z-10">
            <ScrollReveal>
              <div className="text-center max-w-2xl mx-auto">
                <span className="text-xs font-semibold tracking-widest text-accent uppercase mb-4 block">
                  {translate("home.finalCta.kicker")}
                </span>
                <h2 className="text-3xl md:text-4xl font-bold text-primary-foreground mb-4 leading-snug">
                  {translate("home.finalCta.title")}
                </h2>
                <p className="text-primary-foreground/60 mb-8">
                  {translate("home.finalCta.subtitle")}
                </p>
                <div className="flex items-center justify-center gap-4 flex-wrap">
                  <Link
                    href="/register?source=home-free-trial"
                    className="inline-flex items-center rounded-xl bg-accent text-accent-foreground px-10 py-3.5 text-base font-semibold shadow-[0_0_30px_rgba(59,130,246,0.4)] hover:opacity-90 hover:-translate-y-0.5 transition-all"
                  >
                    {translate("home.freeTrial")}
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Link>
                  <Link
                    href="#plans"
                    className="inline-flex rounded-xl border border-primary-foreground/20 bg-transparent px-10 py-3.5 text-base font-semibold text-primary-foreground/80 hover:bg-primary-foreground/10 hover:text-primary-foreground transition-colors"
                  >
                    {translate("home.viewPlans")}
                  </Link>
                </div>
              </div>
            </ScrollReveal>
          </div>
        </section>

        <footer className="border-t border-border bg-card">
          <div className="container py-12">
            <div className="grid md:grid-cols-4 gap-8">
              <div className="md:col-span-1">
                <Link href="/" className="flex items-center gap-2 mb-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/brand-mark.svg?v=2" alt="ListingLive" className="h-8 w-8 rounded-lg object-contain shrink-0" />
                  <span className="text-lg font-bold text-foreground">{translate("common.brand")}</span>
                </Link>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {translate("home.tagline")}
                </p>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-foreground mb-4">Product</h4>
                <ul className="space-y-3">
                  <li><Link href="#plans" className="text-sm text-muted-foreground hover:text-foreground transition-colors">{translate("home.viewPlans")}</Link></li>
                  <li><Link href="/blog" className="text-sm text-muted-foreground hover:text-foreground transition-colors">{translate("home.footer.blog")}</Link></li>
                </ul>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-foreground mb-4">Account</h4>
                <ul className="space-y-3">
                  <li><Link href="/login" className="text-sm text-muted-foreground hover:text-foreground transition-colors">{translate("home.footer.login")}</Link></li>
                  <li><Link href="/register" className="text-sm text-muted-foreground hover:text-foreground transition-colors">{translate("home.footer.register")}</Link></li>
                </ul>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-foreground mb-4">Legal</h4>
                <ul className="space-y-3">
                  <li><span className="text-sm text-muted-foreground">Privacy</span></li>
                  <li><span className="text-sm text-muted-foreground">Terms</span></li>
                </ul>
              </div>
            </div>
            <div className="mt-10 pt-6 border-t border-border flex flex-col md:flex-row items-center justify-between gap-4">
              <p className="text-xs text-muted-foreground">
                &copy; {new Date().getFullYear()} {translate("common.brand")}. All rights reserved.
              </p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Globe className="w-3.5 h-3.5" />
                {locale === "en" ? "English" : "中文"}
              </div>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
