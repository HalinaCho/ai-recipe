---
name: Naeng-Pa-Go
colors:
  surface: '#f9f9f7'
  surface-dim: '#dadad8'
  surface-bright: '#f9f9f7'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f4f4f2'
  surface-container: '#eeeeec'
  surface-container-high: '#e8e8e6'
  surface-container-highest: '#e2e3e1'
  on-surface: '#1a1c1b'
  on-surface-variant: '#4a473c'
  inverse-surface: '#2f3130'
  inverse-on-surface: '#f1f1ef'
  outline: '#7b776a'
  outline-variant: '#cbc6b7'
  surface-tint: '#665f34'
  primary: '#665f34'
  on-primary: '#ffffff'
  primary-container: '#fff4bd'
  on-primary-container: '#776f43'
  inverse-primary: '#d1c794'
  secondary: '#45636e'
  on-secondary: '#ffffff'
  secondary-container: '#c8e8f5'
  on-secondary-container: '#4b6974'
  tertiary: '#456559'
  on-tertiary: '#ffffff'
  tertiary-container: '#d7fbec'
  on-tertiary-container: '#557569'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#eee3ad'
  primary-fixed-dim: '#d1c794'
  on-primary-fixed: '#201c00'
  on-primary-fixed-variant: '#4e471f'
  secondary-fixed: '#c8e8f5'
  secondary-fixed-dim: '#accbd8'
  on-secondary-fixed: '#001f28'
  on-secondary-fixed-variant: '#2d4b55'
  tertiary-fixed: '#c7eadc'
  tertiary-fixed-dim: '#abcec0'
  on-tertiary-fixed: '#002118'
  on-tertiary-fixed-variant: '#2d4d42'
  background: '#f9f9f7'
  on-background: '#1a1c1b'
  surface-variant: '#e2e3e1'
typography:
  display-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 36px
    fontWeight: '800'
    lineHeight: 44px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 22px
    fontWeight: '700'
    lineHeight: 28px
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '500'
    lineHeight: 26px
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 16px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  container-padding: 20px
  gutter: 12px
---

## Brand & Style
The design system is centered on a "Cheerful Butter Yellow" aesthetic, specifically tailored for a mobile-first experience. It targets users looking for a delightful, low-stress interaction with their kitchen inventory. 

The visual style blends **Minimalism** with **Tactile** elements. It utilizes a heavy amount of white space and a restricted pastel palette to keep the interface airy, while using "squishy" high-radius components and soft, colored shadows to create a friendly, physical presence. The emotional response should be one of optimism, cleanliness, and ease of use.

## Colors
This design system uses a high-key, pastel-driven palette. 
- **Primary (Butter Yellow):** Used for main action areas, active states, and brand moments.
- **Secondary (Pastel Blue):** Reserved for informational callouts and secondary navigation elements.
- **Tertiary (Mint Green):** Used for success states and health-related indicators.
- **Neutral:** A warm off-white background ensures the pastel colors don't feel "washed out" against a pure white. 
- **Text:** Avoid pure black; use a deep charcoal (#2D2D2A) to maintain the soft, approachable feel of the interface.

## Typography
The typography utilizes **Plus Jakarta Sans** across all levels to maintain a cohesive, modern, and friendly tone. 

- **Headlines:** Use Bold or ExtraBold weights with slight negative letter spacing to create a "bouncy" and energetic feel.
- **Body:** Use Medium weight for primary reading to ensure legibility against the light background colors.
- **Labels:** Use semi-bold weights for button text and category labels to ensure they stand out without needing heavy borders.
- **Mobile Scaling:** For mobile screens, `display-lg` should be used sparingly for hero headers; `headline-md` is the standard for most page titles.

## Layout & Spacing
The layout follows a **Fluid Grid** model designed for mobile density. 

- **Rhythm:** An 8px base unit drives all spacing. 
- **Safe Areas:** Use a 20px margin on the left and right of the screen to prevent content from hitting the edges.
- **Touch Targets:** Ensure all interactive elements have a minimum height of 48px, even if the visual container appears smaller.
- **Reflow:** On larger devices (tablets), content should transition to a 2-column card layout rather than stretching full-width to maintain the "compact kitchen" aesthetic.

## Elevation & Depth
This design system avoids harsh drop shadows. Instead, it uses **Ambient Tinted Shadows**. 

1. **Depth Level 1 (Resting):** A very soft, wide-spread shadow with a slight yellow tint (`rgba(253, 230, 138, 0.3)`).
2. **Depth Level 2 (Pressed/Active):** No shadow, but a 2px downward translation to simulate a button being physically pressed.
3. **Floating Elements:** Use a backdrop blur (12px) combined with a semi-transparent white fill (80% opacity) for modals and navigation bars to maintain the "airy" feel.

## Shapes
The shape language is defined by **Round Twelve** (12px base radius). 

- **Standard Components:** Buttons, inputs, and cards use a 12px (`0.5rem`) radius.
- **Large Containers:** Bottom sheets and large feature cards use a 24px (`1.5rem`) radius on top corners.
- **Interactive Feedback:** When pressed, shapes should slightly "bulge" or scale by 2-3% to reinforce the playful, squishy brand personality.

## Components
- **Buttons:** Primary buttons use the Butter Yellow fill with the deep charcoal text. No borders. Secondary buttons use a white fill with a 2px Butter Yellow border.
- **Chips:** Used for food categories. These should be pill-shaped with Pastel Blue or Mint Green backgrounds and darker versions of those colors for text.
- **Input Fields:** Soft off-white backgrounds with a 2px border that turns Butter Yellow on focus. Icons should be rounded and monoline.
- **Cards:** White backgrounds with the Ambient Tinted Shadow. Use a 12px padding internally to keep content from feeling cramped.
- **Progress Bars:** Use a "thick" track (12px height) with fully rounded ends. The track is a pale yellow, and the progress indicator is a vibrant Butter Yellow.
- **Navigation:** A bottom bar with a blurred glass effect and oversized, rounded icons. The active state is indicated by a small yellow dot or a subtle background "blob" behind the icon.