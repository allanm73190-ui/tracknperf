# Design System Document: Kinetic High-Performance Editorial

## 1. Overview & Creative North Star
### Creative North Star: "The Kinetic Pulse"
This design system is built to move. It rejects the static, boxy constraints of traditional SaaS platforms in favor of a high-octane, editorial experience. We are building for athletes, not administrators. The "Kinetic Pulse" focuses on **What** (the immediate metric/action) then **Why** (the insight/recommendation). 

The visual language breaks the "template" look through **intentional asymmetry**, ultra-large typographic scales, and a depth model that mimics physical performance gear—layered, resilient, and luminous. We replace rigid grids with "Breathing Layouts" that use negative space as a functional tool to drive focus toward singular performance peaks.

---

## 2. Colors: Tonal Depth & Radiant Accents
The palette is rooted in a "Dark-First" philosophy, utilizing a deep charcoal base to allow neon accents to vibrate.

### The Palette (Material Convention)
- **Base:** `background: #0e0e0e` | `surface: #0e0e0e`
- **Primary (Neon Lime):** `primary: #f3ffca` | `primary_container: #cafd00`
- **Secondary (Vibrant Purple):** `secondary: #c57eff` | `secondary_container: #6a0baa`
- **Status/Alert:** `error: #ff7351`

### The "No-Line" Rule
**Explicit Instruction:** Designers are prohibited from using 1px solid borders to section content. Boundaries must be defined strictly through:
1.  **Tonal Shifts:** Placing a `surface_container_high` card on a `surface` background.
2.  **Negative Space:** Using the Spacing Scale to create a "void" between logical groups.
3.  **Soft Glows:** Using a subtle background-blur or outer glow from the accent colors to define an active state.

### Surface Hierarchy & Nesting
Treat the UI as a series of stacked, semi-transparent tech-fabrics. Use the `surface_container` tiers to create depth:
*   **Level 0 (Base):** `surface` (#0e0e0e)
*   **Level 1 (Sections):** `surface_container_low` (#131313)
*   **Level 2 (Cards):** `surface_container_highest` (#262626)

### Signature Textures: The "Aero-Gradient"
Main CTAs and high-impact hero sections should never be flat. Use a linear gradient (45°) transitioning from `primary_dim` to `primary` to give elements a metallic, high-performance sheen.

---

## 3. Typography: Editorial Authority
We use a high-contrast pairing to distinguish between "Data" and "Narrative."

*   **Display & Headlines (Space Grotesk):** This is our "Power" font. Use `display-lg` (3.5rem) for singular numbers—heart rate, miles, or minutes. It should feel massive, unapologetic, and sporty.
*   **Body & Labels (Manrope):** Our "Precision" font. It provides high readability at small scales. 

**Hierarchy Strategy:** 
*   **What:** Large `display-sm` or `headline-lg` in `on_surface`.
*   **Why:** `body-md` in `on_surface_variant` (reduced opacity) sitting directly below to provide context without competing for attention.

---

## 4. Elevation & Depth: Tonal Layering
Traditional drop shadows are too "web 2.0." For this system, we use **Tonal Layering** and **Glassmorphism**.

### The Layering Principle
Depth is achieved by "stacking." A `surface_container_highest` element on top of a `surface` background provides all the "lift" required. No shadow is needed for static cards.

### Ambient Shadows
If an element is "floating" (e.g., a bottom navigation bar or a modal), use an **Ambient Shadow**:
*   **Color:** A tinted version of the accent (e.g., Purple at 10% opacity).
*   **Blur:** 40px - 60px.
*   **Spread:** 0px.
This creates a "glow" rather than a "shadow," reinforcing the sporty, high-tech aesthetic.

### Glassmorphism & Depth
For overlays and top-level panels, use:
*   `background: rgba(44, 44, 44, 0.6)`
*   `backdrop-filter: blur(20px)`
This allows the "Kinetic Pulse" of background colors/gradients to bleed through, ensuring the UI feels integrated.

---

## 5. Components: Precision Primitives

### Cards (The Core Container)
*   **Shape:** `xl` (1.5rem) or `lg` (1rem) rounded corners.
*   **Border:** Use the **"Ghost Border"** fallback only when accessibility is a concern. `outline_variant` at 15% opacity.
*   **Layout:** No dividers. Use `24px` of vertical padding between list items within a card.

### Buttons (The Kinetic Trigger)
*   **Primary:** `primary_container` background with `on_primary_fixed` text. High-contrast, no border.
*   **Secondary/Ghost:** `outline` color for text with a subtle `surface_container_high` background.
*   **Navigation:** Thick, icon-only navigation using `on_surface_variant` (inactive) and `primary` (active) with a `full` rounded pill background for the active state.

### Sync Status & Badges
*   **The "Performance Pill":** Use `primary` or `secondary` with `0.5rem` horizontal padding. Icons should be used within pills to indicate sync/cloud status. 

### Input Fields
*   **Styling:** Minimalist. No bottom line. Use a `surface_container_highest` block with `md` (0.75rem) rounding. The label should be `label-md` floating above the container.

---

## 6. Do’s and Don'ts

### Do:
*   **Do** use asymmetrical layouts (e.g., one large card taking up 60% of the screen height, followed by two small cards).
*   **Do** lean into the "Anti-SaaS" vibe by using high-performance photography with color overlays.
*   **Do** use the Neon Lime and Vibrant Purple as functional differentiators (e.g., Lime for "Activity," Purple for "Recovery").

### Don't:
*   **Don't** use 1px solid lines or "dividers." Use white space.
*   **Don't** use standard "Grey" for secondary text; use `on_surface_variant` which is a muted version of the brand color.
*   **Don't** use tables. If data is complex, use a series of cards or a vertically-scrolling list of "badges."
*   **Don't** use standard drop shadows. If it doesn't glow or layer tonally, it doesn't belong.

---
**Director's Note:** Every pixel must feel like it was designed for a high-end stopwatch or a supercar dashboard. If it feels "corporate," delete it.