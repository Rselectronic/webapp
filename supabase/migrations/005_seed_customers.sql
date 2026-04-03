-- RS PCB Assembly ERP — Seed Data
-- Migration 005: Seed 11 customers with bom_config

INSERT INTO public.customers (code, company_name, contact_name, contact_email, payment_terms, bom_config, is_active) VALUES
('TLAN', 'Lanka / Knorr-Bremse / KB Rail Canada', 'Luis Esqueda', 'Luis.Esqueda@knorr-bremse.com', 'Net 30',
 '{"header_row": null, "columns_fixed": ["qty", "designator", "cpc", "description", "mpn", "manufacturer"], "encoding": "utf-8", "format": "xlsx", "section_filter": true, "notes": "M CODES SUMMARY section headers must be filtered"}'::jsonb, true),
('LABO', 'GoLabo', 'Genevieve St-Germain', 'gstgermain@golabo.com', 'Net 30', '{"columns": "auto_detect"}'::jsonb, true),
('VO2', 'VO2 Master', 'Martin Ciuraj', 'Martin.c@vo2master.com', 'Net 30', '{"columns": "auto_detect"}'::jsonb, true),
('SBQ', 'SBQuantum', NULL, NULL, 'Net 30', '{"columns": "auto_detect"}'::jsonb, true),
('CVNS', 'Cevians', 'Alain Migneault', 'AMigneault@cevians.com', 'Net 30', '{"columns": "auto_detect"}'::jsonb, true),
('CSA', 'Canadian Space Agency', 'Elodie Ricard', NULL, 'Net 30', '{"columns": "auto_detect"}'::jsonb, true),
('NORPIX', 'Norpix', 'Philippe Candelier', 'pc@norpix.com', 'Net 30', '{"columns": "auto_detect"}'::jsonb, true),
('DAMB', 'Demers Ambulances', NULL, NULL, 'Net 30', '{"columns": "auto_detect"}'::jsonb, true),
('OPKM', 'Optikam', NULL, NULL, 'Net 30', '{"columns": "auto_detect"}'::jsonb, true),
('QTKT', 'Quaketek', NULL, NULL, 'Net 30', '{"columns": "auto_detect"}'::jsonb, true),
('NUVO', 'Nuvotronik', NULL, NULL, 'Net 30', '{"columns": "auto_detect"}'::jsonb, true);
