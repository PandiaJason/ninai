import React from 'react';

export type IconName =
    | 'dashboard' | 'crm' | 'tasks' | 'notes' | 'calendar' | 'settings'
    | 'search' | 'plus' | 'x' | 'chevron-left' | 'chevron-right' | 'chevron-down' | 'chevron-up'
    | 'filter' | 'download' | 'upload' | 'trash' | 'archive' | 'edit' | 'more' | 'link'
    | 'mail' | 'phone' | 'globe' | 'building' | 'user' | 'users' | 'clock' | 'alert'
    | 'check' | 'arrow-right' | 'arrow-left' | 'dollar' | 'tag' | 'target' | 'kanban'
    | 'list' | 'table' | 'star' | 'activity' | 'bell' | 'logout' | 'lock' | 'eye'
    | 'external' | 'flag' | 'refresh' | 'folder' | 'inbox' | 'heart' | 'message'
    | 'file' | 'briefcase' | 'circle-check' | 'plus-circle' | 'calendar-plus' | 'send'
    | 'copy' | 'sparkles' | 'more-vertical' | 'grid' | 'at-sign' | 'map-pin'
    | 'projects' | 'followups' | 'cloud' | 'history' | 'git-branch';

interface IconProps {
    name: IconName;
    size?: number;
    strokeWidth?: number;
    className?: string;
}

export const Icon: React.FC<IconProps> = ({ name, size = 18, strokeWidth = 1.8, className }) => {
    const content = (() => {
        switch (name) {
            case 'dashboard': return <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>;
            case 'crm': return <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>;
            case 'tasks': return <><rect x="3" y="3" width="18" height="18" rx="3" /><path d="m8 12 3 3 5-6" /></>;
            case 'notes': return <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M8 13h8M8 17h5" /></>;
            case 'calendar': return <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>;
            case 'settings': return <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.14.46.53.8 1 .92H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1.08z" /></>;
            case 'search': return <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>;
            case 'plus': return <><path d="M12 5v14M5 12h14" /></>;
            case 'x': return <><path d="M18 6 6 18M6 6l12 12" /></>;
            case 'chevron-left': return <path d="m15 18-6-6 6-6" />;
            case 'chevron-right': return <path d="m9 18 6-6-6-6" />;
            case 'chevron-down': return <path d="m6 9 6 6 6-6" />;
            case 'chevron-up': return <path d="m18 15-6-6-6 6" />;
            case 'filter': return <path d="M22 3H2l8 9.46V19l4 2v-8.54z" />;
            case 'download': return <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5M12 15V3" /></>;
            case 'upload': return <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m17 8-5-5-5 5M12 3v12" /></>;
            case 'trash': return <><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M10 11v6M14 11v6" /></>;
            case 'archive': return <><rect x="2" y="3" width="20" height="5" rx="1" /><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M10 12h4" /></>;
            case 'edit': return <><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z" /></>;
            case 'more': return <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>;
            case 'more-vertical': return <><circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" /></>;
            case 'link': return <><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></>;
            case 'mail': return <><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 6L2 7" /></>;
            case 'phone': return <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />;
            case 'globe': return <><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></>;
            case 'building': return <><rect x="4" y="2" width="16" height="20" rx="2" /><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M8 10h.01M16 10h.01M8 14h.01M16 14h.01" /></>;
            case 'user': return <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>;
            case 'users': return <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>;
            case 'clock': return <><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></>;
            case 'alert': return <><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><path d="M12 9v4M12 17h.01" /></>;
            case 'check': return <path d="M20 6 9 17l-5-5" />;
            case 'arrow-right': return <><path d="M5 12h14M12 5l7 7-7 7" /></>;
            case 'arrow-left': return <><path d="M19 12H5M12 19l-7-7 7-7" /></>;
            case 'dollar': return <><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></>;
            case 'tag': return <><path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><circle cx="7" cy="7" r="1.5" /></>;
            case 'target': return <><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></>;
            case 'kanban': return <><rect x="3" y="3" width="5" height="18" rx="1" /><rect x="10" y="3" width="5" height="12" rx="1" /><rect x="17" y="3" width="5" height="8" rx="1" /></>;
            case 'list': return <><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></>;
            case 'table': return <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M3 15h18M9 3v18M15 3v18" /></>;
            case 'grid': return <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>;
            case 'star': return <path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z" />;
            case 'activity': return <path d="M22 12h-4l-3 9L9 3l-3 9H2" />;
            case 'bell': return <><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" /></>;
            case 'logout': return <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5M21 12H9" /></>;
            case 'lock': return <><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>;
            case 'eye': return <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>;
            case 'external': return <><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><path d="M15 3h6v6M10 14 21 3" /></>;
            case 'flag': return <><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><path d="M4 22v-7" /></>;
            case 'refresh': return <><path d="M23 4v6h-6M1 20v-6h6" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></>;
            case 'folder': return <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />;
            case 'inbox': return <><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></>;
            case 'heart': return <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />;
            case 'message': return <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />;
            case 'file': return <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></>;
            case 'briefcase': return <><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></>;
            case 'circle-check': return <><circle cx="12" cy="12" r="10" /><path d="m8 12 3 3 5-6" /></>;
            case 'plus-circle': return <><circle cx="12" cy="12" r="10" /><path d="M12 8v8M8 12h8" /></>;
            case 'calendar-plus': return <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18M12 14v4M10 16h4" /></>;
            case 'send': return <><path d="m22 2-7 20-4-9-9-4z" /><path d="M22 2 11 13" /></>;
            case 'copy': return <><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>;
            case 'sparkles': return <><path d="m12 3 1.9 4.1L18 9l-4.1 1.9L12 15l-1.9-4.1L6 9l4.1-1.9z" /><path d="m19 15 .8 1.7 1.7.8-1.7.8L19 20l-.8-1.7-1.7-.8 1.7-.8z" /></>;
            case 'at-sign': return <><circle cx="12" cy="12" r="4" /><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94" /></>;
            case 'map-pin': return <><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></>;
            case 'projects': return <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M8 4v16M3 10h5M3 15h5" /><path d="M11 9h6M11 13h4" /></>;
            case 'followups': return <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /><path d="m16.5 17.5 1.5 1.5 3-3" /></>;
            case 'cloud': return <><path d="M18 18a4 4 0 0 0 .5-7.97A6 6 0 0 0 6.7 9.3 3.5 3.5 0 0 0 7 18z" /><path d="M12 12v6M9.5 15.5 12 18l2.5-2.5" /></>;
            case 'history': return <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></>;
            case 'git-branch': return <><circle cx="6" cy="5" r="2" /><circle cx="6" cy="19" r="2" /><circle cx="18" cy="7" r="2" /><path d="M6 7v10M8 5h4a4 4 0 0 1 4 4v8" /></>;
            default: return null;
        }
    })();

    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
            aria-hidden="true"
            focusable="false"
        >
            {content}
        </svg>
    );
};
