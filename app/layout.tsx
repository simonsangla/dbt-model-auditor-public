import type { Metadata } from "next"
import type React from "react"
import { MobileNav } from "@/components/app-sidebar"
import { CommercialTopBanner, CommercialFooter, TRUST_SPRINT_URL } from "@/components/commercial-bridge"
import { ThemeProvider } from "@/components/theme-provider"
import { SiteAnalytics } from "@/components/site-analytics"
import { ConsentBanner } from "@/components/consent-banner"
import { shouldRenderAnalytics } from "@/lib/analytics"
import { QueryProvider } from "@/components/query-provider"
import { APP_TITLE, LOGO_SRC } from "@/lib/constants"
import { SpeedInsights } from "@vercel/speed-insights/next"
import "./globals.css"


export const metadata: Metadata = {
  title: APP_TITLE,
  description: "Read-only metadata audit for Snowflake and dbt projects",
  icons: { icon: LOGO_SRC },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className="font-sans antialiased flex min-h-screen bg-background text-foreground"
      >
        <ThemeProvider>
          <QueryProvider>
            <div className="flex w-full min-h-screen">
              <div className="flex-1 flex flex-col min-w-0">
                <CommercialTopBanner />
                <MobileNav />
                <main className="flex-1">{children}</main>
                <CommercialFooter />
              </div>
              {shouldRenderAnalytics() && <SiteAnalytics />}
              <ConsentBanner enabled={shouldRenderAnalytics()} privacyUrl={`${TRUST_SPRINT_URL}/privacy`} />
            </div>
          </QueryProvider>
        </ThemeProvider>
        <SpeedInsights />
      </body>
    </html>
  )
}
