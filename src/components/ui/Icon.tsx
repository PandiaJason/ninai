import React from 'react';
import {
    Activity,
    Archive,
    ArrowLeft,
    ArrowRight,
    AtSign,
    Bell,
    Briefcase,
    Building2,
    CalendarClock,
    CalendarDays,
    CalendarPlus,
    ChartColumn,
    Check,
    CheckCircle2,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ChevronUp,
    Clock,
    CloudDownload,
    Columns3,
    Copy,
    DollarSign,
    Download,
    ExternalLink,
    Eye,
    FileText,
    Filter,
    Flag,
    Folder,
    FolderKanban,
    GitBranch,
    Globe2,
    Grid2x2,
    Heart,
    History,
    Inbox,
    LayoutGrid,
    Link2,
    List,
    ListChecks,
    Lock,
    LogOut,
    Mail,
    MapPin,
    MessageSquare,
    MoreHorizontal,
    MoreVertical,
    Pencil,
    Phone,
    Plus,
    PlusCircle,
    RefreshCw,
    Search,
    Send,
    Settings2,
    Sparkles,
    Star,
    Table,
    Tag,
    Target,
    Trash2,
    TriangleAlert,
    Upload,
    User,
    Users,
    X,
    type LucideIcon,
} from 'lucide-react';

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
    | 'projects' | 'followups' | 'cloud' | 'history' | 'git-branch' | 'chart';

const ICONS: Record<IconName, LucideIcon> = {
    dashboard: LayoutGrid,
    crm: Users,
    tasks: ListChecks,
    notes: FileText,
    calendar: CalendarDays,
    settings: Settings2,
    search: Search,
    plus: Plus,
    x: X,
    'chevron-left': ChevronLeft,
    'chevron-right': ChevronRight,
    'chevron-down': ChevronDown,
    'chevron-up': ChevronUp,
    filter: Filter,
    download: Download,
    upload: Upload,
    trash: Trash2,
    archive: Archive,
    edit: Pencil,
    more: MoreHorizontal,
    link: Link2,
    mail: Mail,
    phone: Phone,
    globe: Globe2,
    building: Building2,
    user: User,
    users: Users,
    clock: Clock,
    alert: TriangleAlert,
    check: Check,
    'arrow-right': ArrowRight,
    'arrow-left': ArrowLeft,
    dollar: DollarSign,
    tag: Tag,
    target: Target,
    kanban: Columns3,
    list: List,
    table: Table,
    star: Star,
    activity: Activity,
    bell: Bell,
    logout: LogOut,
    lock: Lock,
    eye: Eye,
    external: ExternalLink,
    flag: Flag,
    refresh: RefreshCw,
    folder: Folder,
    inbox: Inbox,
    heart: Heart,
    message: MessageSquare,
    file: FileText,
    briefcase: Briefcase,
    'circle-check': CheckCircle2,
    'plus-circle': PlusCircle,
    'calendar-plus': CalendarPlus,
    send: Send,
    copy: Copy,
    sparkles: Sparkles,
    'more-vertical': MoreVertical,
    grid: Grid2x2,
    'at-sign': AtSign,
    'map-pin': MapPin,
    projects: FolderKanban,
    followups: CalendarClock,
    cloud: CloudDownload,
    history: History,
    'git-branch': GitBranch,
    chart: ChartColumn,
};

interface IconProps {
    name: IconName;
    size?: number;
    strokeWidth?: number;
    className?: string;
}

export const Icon: React.FC<IconProps> = ({ name, size = 18, strokeWidth = 1.8, className }) => {
    const Component = ICONS[name];
    if (!Component) return null;
    return (
        <Component
            size={size}
            strokeWidth={strokeWidth}
            className={className}
            aria-hidden="true"
            focusable="false"
        />
    );
};
