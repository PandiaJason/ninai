/** RFC4180-style CSV parser (handles quoted fields, commas, CRLF and newlines). */
export function parseCsv(text: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let inQuotes = false;
    const input = text.replace(/^\uFEFF/, '');

    for (let i = 0; i < input.length; i++) {
        const char = input[i];
        const next = input[i + 1];

        if (inQuotes) {
            if (char === '"' && next === '"') {
                field += '"';
                i++;
            } else if (char === '"') {
                inQuotes = false;
            } else {
                field += char;
            }
            continue;
        }

        if (char === '"') {
            inQuotes = true;
        } else if (char === ',') {
            row.push(field);
            field = '';
        } else if (char === '\n') {
            row.push(field.replace(/\r$/, ''));
            field = '';
            if (row.some(cell => cell.trim() !== '')) rows.push(row);
            row = [];
        } else {
            field += char;
        }
    }

    if (field !== '' || row.length > 0) {
        row.push(field.replace(/\r$/, ''));
        if (row.some(cell => cell.trim() !== '')) rows.push(row);
    }

    return rows;
}

function escapeCell(value: unknown): string {
    let text = value === null || value === undefined ? '' : String(value);
    // Prevent CSV formula injection when opened in spreadsheets.
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
    return [headers, ...rows]
        .map(row => row.map(escapeCell).join(','))
        .join('\r\n');
}

export function downloadCsv(filename: string, csv: string): void {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

export function normalizeHeader(header: string): string {
    return header.toLowerCase().replace(/[^a-z0-9]/g, '');
}
