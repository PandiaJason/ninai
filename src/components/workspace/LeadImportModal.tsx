import React, { useMemo, useRef, useState } from 'react';
import { importLeads, type LeadImportResult } from '../../services/leads';
import { parseCsv, toCsv, downloadCsv, normalizeHeader } from '../../utils/csv';
import { toErrorMessage } from '../../services/errors';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Misc';
import { Field, Select, TextArea } from '../ui/Form';
import { Icon } from '../ui/Icon';
import { useToast } from '../ui/Toast';

const TARGET_FIELDS = [
    { key: 'name', label: 'Lead name', required: true },
    { key: 'audience', label: 'Audience (learner or institution)' },
    { key: 'company', label: 'Company / institution' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' },
    { key: 'website', label: 'Website' },
    { key: 'jobTitle', label: 'Job title' },
    { key: 'stage', label: 'Stage' },
    { key: 'priority', label: 'Priority' },
    { key: 'value', label: 'Deal value' },
    { key: 'source', label: 'Source' },
    { key: 'sourceDetail', label: 'Source detail' },
    { key: 'persona', label: 'Persona' },
    { key: 'quality', label: 'Lead quality' },
    { key: 'industry', label: 'Industry' },
    { key: 'location', label: 'Location' },
    { key: 'institutionType', label: 'Institution type' },
    { key: 'studentCount', label: 'Student count' },
    { key: 'attempts', label: 'Challenge attempts' },
    { key: 'firstChallenge', label: 'First challenge' },
    { key: 'tracks', label: 'Tracks explored' },
    { key: 'dropOffReason', label: 'Drop-off reason' },
    { key: 'owner', label: 'Owner (email or name)' },
    { key: 'description', label: 'Description' },
    { key: 'tags', label: 'Tags' },
] as const;

type TargetKey = typeof TARGET_FIELDS[number]['key'];

interface LeadImportModalProps {
    open: boolean;
    workspaceId: string;
    onClose: () => void;
    onImported: () => void;
}

export const LeadImportModal: React.FC<LeadImportModalProps> = ({ open, workspaceId, onClose, onImported }) => {
    const toast = useToast();
    const fileRef = useRef<HTMLInputElement>(null);
    const [headers, setHeaders] = useState<string[]>([]);
    const [rows, setRows] = useState<string[][]>([]);
    const [mapping, setMapping] = useState<Record<TargetKey, number>>(emptyMapping());
    const [pasteText, setPasteText] = useState('');
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<LeadImportResult | null>(null);
    const [error, setError] = useState('');

    React.useEffect(() => {
        if (!open) return;
        setHeaders([]);
        setRows([]);
        setMapping(emptyMapping());
        setPasteText('');
        setResult(null);
        setError('');
    }, [open]);

    const loadCsv = (text: string) => {
        setError('');
        setResult(null);
        const parsed = parseCsv(text);
        if (parsed.length < 2) {
            setError('The CSV needs a header row and at least one data row.');
            return;
        }
        const [headerRow, ...dataRows] = parsed;
        setHeaders(headerRow);
        setRows(dataRows);
        const auto = emptyMapping();
        headerRow.forEach((header, index) => {
            const normalized = normalizeHeader(header);
            TARGET_FIELDS.forEach(field => {
                if (auto[field.key] !== -1) return;
                const target = normalizeHeader(field.label);
                if (normalized === normalizeHeader(field.key) || normalized === target || normalized.includes(normalizeHeader(field.key))) {
                    auto[field.key] = index;
                }
            });
        });
        setMapping(auto);
    };

    const onFile = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => loadCsv(String(reader.result || ''));
        reader.onerror = () => setError('Could not read that file.');
        reader.readAsText(file);
    };

    const preview = useMemo(() => {
        return rows.slice(0, 4).map(row => {
            const record: Record<string, string> = {};
            TARGET_FIELDS.forEach(field => {
                const index = mapping[field.key];
                record[field.key] = index >= 0 ? (row[index] || '') : '';
            });
            return record;
        });
    }, [rows, mapping]);

    const importNow = async () => {
        setError('');
        if (mapping.name < 0) {
            setError('Map a column to Lead name before importing.');
            return;
        }
        setBusy(true);
        try {
            const records = rows.map(row => {
                const record: Record<string, string> = {};
                TARGET_FIELDS.forEach(field => {
                    const index = mapping[field.key];
                    if (index >= 0) record[field.key] = row[index] || '';
                });
                return record;
            });
            const imported = await importLeads(workspaceId, records);
            setResult(imported);
            onImported();
            toast.success(`${imported.imported} lead${imported.imported === 1 ? '' : 's'} imported.`);
        } catch (e) {
            setError(toErrorMessage(e));
        } finally {
            setBusy(false);
        }
    };

    const sample = () => {
        const csv = toCsv(
            ['Lead Name', 'Audience', 'Company', 'Email', 'Phone', 'Stage', 'Priority', 'Source', 'Source Detail', 'Persona', 'Quality', 'Challenge Attempts', 'Tracks', 'Owner Email', 'Tags', 'Description'],
            [['Ada Lovelace', 'learner', 'Analytical Engines', 'ada@example.com', '+1 555 0100', 'Requested', 'high', 'LinkedIn', 'FDE launch post', 'Final-year student', 'Genuine FDE intent', '2', 'Unix Shell; HTTP & APIs', 'admin@ninai.app', 'first-cohort', 'Asked about the systems track after the launch post.']],
        );
        downloadCsv('ninai_leads_template.csv', csv);
    };

    return (
        <Modal
            open={open}
            onClose={onClose}
            title="Import leads from CSV"
            subtitle="Map your columns, review a preview, then import. Duplicate emails, phones and names are skipped automatically."
            size="lg"
            footer={(
                <>
                    <Button onClick={sample} icon="download">Sample CSV</Button>
                    <span style={{ flex: 1 }} />
                    <Button onClick={onClose} disabled={busy}>{result ? 'Close' : 'Cancel'}</Button>
                    <Button variant="primary" icon="upload" loading={busy} disabled={rows.length === 0 || !!result} onClick={() => void importNow()}>
                        Import {rows.length > 0 ? `${rows.length} row${rows.length === 1 ? '' : 's'}` : ''}
                    </Button>
                </>
            )}
        >
            {result ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div className="ws-grid ws-grid-3">
                        <div className="ws-meta-item"><span>Imported</span><strong>{result.imported}</strong></div>
                        <div className="ws-meta-item"><span>Skipped duplicates</span><strong>{result.skippedDuplicates}</strong></div>
                        <div className="ws-meta-item"><span>Invalid rows</span><strong>{result.invalid.length}</strong></div>
                    </div>
                    {result.invalid.length > 0 && (
                        <div className="ws-card ws-card-padded">
                            <div className="ws-subheading">Rows that need attention</div>
                            {result.invalid.slice(0, 30).map(row => (
                                <div key={row.row} className="ws-small" style={{ padding: '5px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                                    <strong>Row {row.row}:</strong> {row.errors.join(', ')}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div className="ws-form-row" style={{ gap: 10 }}>
                        <Button icon="upload" onClick={() => fileRef.current?.click()}>Choose CSV file</Button>
                        <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={onFile} />
                        <span className="ws-muted">or paste CSV content below</span>
                    </div>

                    <Field label="Paste CSV" htmlFor="lead-csv-paste">
                        <TextArea
                            id="lead-csv-paste"
                            value={pasteText}
                            onChange={e => setPasteText(e.target.value)}
                            placeholder="Lead Name,Company,Email,Phone,…"
                            style={{ minHeight: 80 }}
                        />
                    </Field>
                    {pasteText.trim() && <div style={{ display: 'flex', justifyContent: 'flex-end' }}><Button size="sm" onClick={() => loadCsv(pasteText)}>Parse pasted CSV</Button></div>}

                    {error && <div className="ws-form-error"><Icon name="alert" size={15} /><span>{error}</span></div>}

                    {headers.length > 0 && (
                        <>
                            <div className="ws-form-section">
                                <div className="ws-form-section-title">Field mapping</div>
                                <div className="ws-form-grid">
                                    {TARGET_FIELDS.map(field => (
                                        <Field key={field.key} label={(field as { required?: boolean }).required ? `${field.label} *` : field.label} htmlFor={`map-${field.key}`}>
                                            <Select
                                                id={`map-${field.key}`}
                                                value={mapping[field.key]}
                                                onChange={e => setMapping(prev => ({ ...prev, [field.key]: Number(e.target.value) }))}
                                            >
                                                <option value={-1}>— Not mapped —</option>
                                                {headers.map((header, index) => <option key={`${header}-${index}`} value={index}>{header || `Column ${index + 1}`}</option>)}
                                            </Select>
                                        </Field>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <div className="ws-subheading">Preview</div>
                                <div className="ws-table-wrap">
                                    <table className="ws-table" style={{ minWidth: 700 }}>
                                        <thead>
                                            <tr>
                                                <th>Name</th><th>Audience</th><th>Company</th><th>Email</th><th>Stage</th><th>Source</th><th>Quality</th><th>Attempts</th><th>Owner</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {preview.map((row, index) => (
                                                <tr key={index} style={{ cursor: 'default' }}>
                                                    <td className="cell-title">{row.name || '—'}</td>
                                                    <td>{row.audience || 'learner'}</td>
                                                    <td>{row.company || '—'}</td>
                                                    <td>{row.email || '—'}</td>
                                                    <td>{row.stage || 'Default'}</td>
                                                    <td>{row.source || '—'}</td>
                                                    <td>{row.quality || '—'}</td>
                                                    <td>{row.attempts || '0'}</td>
                                                    <td>{row.owner || 'You'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}
        </Modal>
    );
};

function emptyMapping(): Record<TargetKey, number> {
    const mapping = {} as Record<TargetKey, number>;
    TARGET_FIELDS.forEach(field => { mapping[field.key] = -1; });
    return mapping;
}
