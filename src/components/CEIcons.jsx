"use client";

// CE custom icon set — 1.25 stroke, 16px viewbox, line style.
// Single path per icon; use stroke="currentColor".

const Icon = ({ d, size = 14, stroke = 1.25, style, ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={style} {...rest}>
    <path d={d} stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const IconHome      = (p) => <Icon d="M2.5 7L8 2.5 13.5 7v6.5H10v-4H6v4H2.5z" {...p} />;
export const IconStrategy  = (p) => <Icon d="M2 13.5L6 9l3 3 5-6.5M9.5 5.5h4v4" {...p} />;
export const IconIdeas     = (p) => <Icon d="M5.5 11h5M6 13.5h4M8 1.5a4.5 4.5 0 014.5 4.5c0 1.7-.9 2.7-1.5 3.5-.6.8-1 1.3-1 2H6c0-.7-.4-1.2-1-2-.6-.8-1.5-1.8-1.5-3.5A4.5 4.5 0 018 1.5z" {...p} />;
export const IconCreate    = (p) => <Icon d="M2.5 11L11 2.5l2.5 2.5L5 13.5H2.5zM10 4l2 2" {...p} />;
export const IconPipeline  = (p) => <Icon d="M2.5 4h11M2.5 8h11M2.5 12h7" {...p} />;
export const IconCalendar  = (p) => <Icon d="M2.5 4.5h11v9h-11zM5.5 2v3M10.5 2v3M2.5 7h11" {...p} />;
export const IconAnalyze   = (p) => <Icon d="M2.5 13.5V11M6 13.5V6.5M9.5 13.5V8.5M13 13.5V3" {...p} />;
export const IconSearch    = (p) => <Icon d="M11.5 11.5L14 14M7 12.5a5.5 5.5 0 100-11 5.5 5.5 0 000 11z" {...p} />;
export const IconSettings  = (p) => <Icon d="M8 5.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5zM12.2 7.2l1.3-1-1.3-2.2-1.5.6c-.4-.3-.9-.5-1.4-.7L9.1 2H6.9l-.2 1.5c-.5.2-1 .4-1.4.7l-1.5-.6-1.3 2.2 1.3 1c-.1.5-.1.8 0 1.4l-1.3 1L3.8 11.6l1.5-.6c.4.3.9.5 1.4.7l.2 1.5h2.2l.2-1.5c.5-.2 1-.4 1.4-.7l1.5.6 1.3-2.2-1.3-1c.1-.5.1-.9 0-1.2z" {...p} />;
export const IconCampaigns = (p) => <Icon d="M5 5V3.5a.5.5 0 01.5-.5h5a.5.5 0 01.5.5V5M2.5 5h11v8.5h-11z" {...p} />;
export const IconCheck     = (p) => <Icon d="M3 8.5L6.5 12 13 4" {...p} />;
export const IconArrow     = (p) => <Icon d="M3 8h10M9 4l4 4-4 4" {...p} />;
export const IconChev      = (p) => <Icon d="M6 4l4 4-4 4" {...p} />;
export const IconChevD     = (p) => <Icon d="M4 6l4 4 4-4" {...p} />;
export const IconPlus      = (p) => <Icon d="M8 3v10M3 8h10" {...p} />;
export const IconClose     = (p) => <Icon d="M4 4l8 8M12 4l-8 8" {...p} />;
export const IconDoc       = (p) => <Icon d="M4 2h5l3 3v9H4zM9 2v3h3M6 8h4M6 11h4" {...p} />;
export const IconLink      = (p) => <Icon d="M7 5.5H5a2.5 2.5 0 100 5h2M9 10.5h2a2.5 2.5 0 100-5H9M6 8h4" {...p} />;
export const IconAt        = (p) => <Icon d="M10.5 8a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0zm0 0v1.2c0 1 1.5 1 1.5-.2V8a4 4 0 10-1.6 3.2" {...p} />;
export const IconAttach    = (p) => <Icon d="M11 7l-4.5 4.5a2 2 0 11-2.8-2.8L8.2 4.2a3 3 0 014.2 4.2L7.5 13.4" {...p} />;
export const IconStop      = (p) => <Icon d="M4 4h8v8H4z" {...p} />;
export const IconFilter    = (p) => <Icon d="M2.5 4h11M5 8h6M7 12h2" {...p} />;
export const IconBolt      = (p) => <Icon d="M8.5 2L3.5 9h4l-1 5 5-7h-4z" {...p} />;
export const IconMore      = (p) => <Icon d="M3.5 8h.01M8 8h.01M12.5 8h.01" {...p} />;
export const IconExternal  = (p) => <Icon d="M6 3H3v10h10v-3M10 3h3v3M8 8l5-5" {...p} />;
export const IconEye       = (p) => <Icon d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8zM8 10a2 2 0 100-4 2 2 0 000 4z" {...p} />;
export const IconImage     = (p) => <Icon d="M2.5 3.5h11v9h-11zM5 7a1 1 0 100-2 1 1 0 000 2zM2.5 11l3-3 3 3 2-2 2.5 2.5" {...p} />;
export const IconUndo      = (p) => <Icon d="M5 5L2.5 7.5 5 10M2.5 7.5h7a3 3 0 013 3v2" {...p} />;
export const IconUser      = (p) => <Icon d="M8 8.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM3 13.5c0-2.2 2.2-4 5-4s5 1.8 5 4" {...p} />;
export const IconLayers    = (p) => <Icon d="M8 2L2 5l6 3 6-3zM2 8l6 3 6-3M2 11l6 3 6-3" {...p} />;
export const IconSparkle   = (p) => <Icon d="M8 2v3M8 11v3M2 8h3M11 8h3M4 4l2 2M10 10l2 2M12 4l-2 2M4 12l2-2" {...p} />;
export const IconSend      = (p) => <Icon d="M14 2L7 9M14 2L9.5 14l-2.5-5L2 6.5z" {...p} />;
export const IconClock     = (p) => <Icon d="M8 4v4l2.5 2.5M14 8a6 6 0 11-12 0 6 6 0 0112 0z" {...p} />;
