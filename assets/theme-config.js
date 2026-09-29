// Shared Tailwind theme for every page on this site.
// Loaded via <script src=".../assets/theme-config.js"></script> right after the
// Tailwind CDN <script> tag. Keep this file identical everywhere so every page
// generates the exact same utility classes (bg-surface, text-primary, etc.).
tailwind.config = {
    darkMode: "class",
    theme: {
        extend: {
            "colors": {
                "on-surface-variant": "#c7c4d7",
                "on-secondary-fixed-variant": "#005236",
                "surface-dim": "#0b1326",
                "surface-container-high": "#222a3d",
                "primary-fixed": "#e1e0ff",
                "inverse-primary": "#494bd6",
                "on-secondary-container": "#00311f",
                "tertiary-fixed-dim": "#ffb95f",
                "on-error-container": "#ffdad6",
                "on-surface": "#dae2fd",
                "error-container": "#93000a",
                "secondary": "#4edea3",
                "on-primary-container": "#0d0096",
                "primary-container": "#8083ff",
                "inverse-on-surface": "#283044",
                "surface": "#0b1326",
                "primary-fixed-dim": "#c0c1ff",
                "on-tertiary-fixed-variant": "#653e00",
                "on-primary-fixed-variant": "#2f2ebe",
                "on-tertiary-fixed": "#2a1700",
                "outline": "#908fa0",
                "on-tertiary-container": "#3e2400",
                "on-secondary": "#003824",
                "on-primary-fixed": "#07006c",
                "tertiary": "#ffb95f",
                "secondary-fixed-dim": "#4edea3",
                "on-tertiary": "#472a00",
                "outline-variant": "#464554",
                "error": "#ffb4ab",
                "secondary-fixed": "#6ffbbe",
                "surface-container-low": "#131b2e",
                "surface-container-highest": "#2d3449",
                "surface-bright": "#31394d",
                "surface-tint": "#c0c1ff",
                "on-background": "#dae2fd",
                "secondary-container": "#00a572",
                "surface-variant": "#2d3449",
                "on-secondary-fixed": "#002113",
                "inverse-surface": "#dae2fd",
                "primary": "#c0c1ff",
                "on-error": "#690005",
                "tertiary-container": "#ca8100",
                "on-primary": "#1000a9",
                "tertiary-fixed": "#ffddb8",
                "surface-container": "#171f33",
                "background": "#0b1326",
                "surface-container-lowest": "#060e20"
            },
            "borderRadius": { "DEFAULT": "0.25rem", "lg": "0.5rem", "xl": "0.75rem", "full": "9999px" },
            "spacing": { "gutter": "24px", "container-max": "1280px", "margin-sm": "16px", "margin-lg": "80px", "margin-md": "40px", "base": "4px" },
            "fontFamily": { "headline-lg": ["Geist"], "label-sm": ["JetBrains Mono"], "display-lg": ["Geist"], "body-md": ["Geist"], "headline-lg-mobile": ["Geist"] },
            "fontSize": {
                "headline-lg": ["32px", { "lineHeight": "1.2", "letterSpacing": "-0.02em", "fontWeight": "600" }],
                "label-sm": ["12px", { "lineHeight": "1", "letterSpacing": "0.05em", "fontWeight": "500" }],
                "display-lg": ["56px", { "lineHeight": "1.08", "letterSpacing": "-0.04em", "fontWeight": "800" }],
                "body-md": ["16px", { "lineHeight": "1.6", "fontWeight": "400" }],
                "headline-lg-mobile": ["24px", { "lineHeight": "1.2", "fontWeight": "600" }]
            }
        }
    }
}
