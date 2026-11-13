import React from 'react';
import { Icon, type IconName } from './Icon';

interface KpiCardProps {
    label: string;
    value: number | string;
    hint?: string;
    icon: IconName;
    onClick?: () => void;
}

export const KpiCard: React.FC<KpiCardProps> = ({ label, value, hint, icon, onClick }) => (
    <button
        type="button"
        className="ws-kpi"
        onClick={onClick}
        aria-label={hint ? `${label}: ${value}. ${hint}` : `${label}: ${value}`}
    >
        <span className="ws-kpi-top">
            <span className="ws-kpi-label">{label}</span>
            <span className="ws-kpi-icon"><Icon name={icon} size={14} strokeWidth={1.9} /></span>
        </span>
        <span className="ws-kpi-value">{value}</span>
        <span className="ws-kpi-foot">
            <span>{hint}</span>
            <Icon name="arrow-right" size={12} />
        </span>
    </button>
);
