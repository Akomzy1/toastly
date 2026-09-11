import type { Config } from "tailwindcss";

/**
 * Toastly design tokens.
 *
 * Every value here is read from design/prototype/design-system.slim.html —
 * the approved prototype, which CLAUDE.md and SKILL.md both make the binding
 * source of truth for UI. Do not add Tailwind default palettes, and do not
 * introduce a colour, size or radius that is not in the prototype. If a new
 * value is genuinely needed, it goes back through the design pipeline first
 * (SKILL.md, "When the prototype doesn't cover something").
 */
const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    // Deliberately NOT extend: the prototype palette replaces Tailwind's
    // defaults outright, so no unapproved colour is reachable. Note the two
    // different failure modes, verified against this config: `@apply
    // bg-blue-500` in CSS is a hard build error, but `bg-blue-500` used as a
    // class in markup emits NO css and fails silently -- the element just
    // renders unstyled. Review markup classes; the build will not catch them.
    colors: {
      transparent: "transparent",
      current: "currentColor",
      white: "#FFFFFF",

      // Green ramp — primary brand surface
      green: {
        50: "#E5F0EE",
        100: "#CCE1DE",
        300: "#4C968C",
        500: "#00695C", // primary
        600: "#005449",
        700: "#002A24",
        800: "#001F1B", // base deep-green surface
      },

      // Gold ramp — primary CTA
      gold: {
        50: "#FFF7E5",
        100: "#FFEFCC",
        300: "#FFC94C", // hover
        500: "#FFB300", // accent / CTA
        600: "#CC8F00",
        800: "#4C3500",
      },

      champagne: "#EBD9AE", // Champagne 200
      paper: "#F6F2EA", // light surface

      grey: {
        100: "#F2F2F2",
        200: "#D9D9DA",
        400: "#828184",
        600: "#504E52",
      },

      ink: {
        800: "#1E1C21",
        900: "#050309", // body text
      },

      // Semantic — usage notes come from the prototype's own swatch captions
      success: "#2F8F5B", // verification passed, deposit returned
      warning: "#CC8F00", // session expiring, incomplete profile
      error: "#9B1348", // failed check, reported account
      info: "#4C968C", // neutral system notes
    },

    fontFamily: {
      // Editorial serif for headings, clean sans for body/UI.
      serif: ["var(--font-aleo)", "Aleo", "Georgia", "serif"],
      sans: ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
    },

    // The prototype's type scale, fluid clamps included.
    fontSize: {
      display: ["clamp(44px,7vw,72px)", { lineHeight: "1.04", letterSpacing: "-0.02em", fontWeight: "700" }],
      h2: ["clamp(40px,5vw,52px)", { lineHeight: "1.12", letterSpacing: "-0.01em", fontWeight: "700" }],
      h3: ["clamp(32px,4vw,44px)", { lineHeight: "1.16", letterSpacing: "-0.01em", fontWeight: "700" }],
      h4: ["clamp(24px,3vw,36px)", { lineHeight: "1.25", letterSpacing: "0", fontWeight: "700" }],
      h5: ["clamp(20px,2.4vw,28px)", { lineHeight: "1.3", letterSpacing: "0", fontWeight: "700" }],
      eyebrow: ["clamp(18px,2vw,22px)", { lineHeight: "1.4", letterSpacing: "0.02em", fontWeight: "700" }],
      "body-lg": ["clamp(18px,2vw,22px)", { lineHeight: "1.6", letterSpacing: "0" }],
      body: ["16px", { lineHeight: "1.65", letterSpacing: "0" }],
      caption: ["13px", { lineHeight: "1.5", letterSpacing: "0.06em", fontWeight: "500" }],
      button: ["15px", { lineHeight: "1.2", letterSpacing: "0.01em", fontWeight: "600" }],
    },

    borderRadius: {
      none: "0",
      sm: "6px",
      md: "10px",
      lg: "12px",
      xl: "16px",
      pill: "999px",
      full: "9999px",
    },

    extend: {
      // Section rhythm, lifted from the prototype's clamp() padding pattern.
      spacing: {
        "section-y": "clamp(52px,7vw,96px)",
        "section-y-lg": "clamp(56px,8vw,112px)",
        "section-x": "clamp(20px,5vw,48px)",
      },
      maxWidth: {
        container: "1280px",
        prose: "1180px",
        measure: "640px",
      },
      transitionTimingFunction: {
        // SKILL.md: motion is subtle and editorial — no bounce, no spring.
        editorial: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
