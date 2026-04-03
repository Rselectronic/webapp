-- Seed overage/attrition rates per M-Code
-- Used in quoting to calculate component overage quantities

INSERT INTO overage_table (m_code, qty_min, qty_max, overage_pct, notes) VALUES

-- 0201 ultra-tiny: high loss rate
('0201', 1,    99,    15.0, '0201 small qty — 15% attrition'),
('0201', 100,  999,   10.0, '0201 medium qty — 10% attrition'),
('0201', 1000, NULL,   7.0, '0201 high qty — 7% attrition'),

-- 0402 small passives: moderate loss
('0402', 1,    99,    10.0, '0402 small qty — 10% attrition'),
('0402', 100,  999,    7.0, '0402 medium qty — 7% attrition'),
('0402', 1000, NULL,   5.0, '0402 high qty — 5% attrition'),

-- CP chip package: standard SMT
('CP',   1,    99,     7.0, 'CP small qty — 7% attrition'),
('CP',   100,  999,    5.0, 'CP medium qty — 5% attrition'),
('CP',   1000, NULL,   3.0, 'CP high qty — 3% attrition'),

-- CPEXP expanded SMT
('CPEXP', 1,   99,     7.0, 'CPEXP small qty — 7% attrition'),
('CPEXP', 100, 999,    5.0, 'CPEXP medium qty — 5% attrition'),
('CPEXP', 1000, NULL,  3.0, 'CPEXP high qty — 3% attrition'),

-- IP large IC packages: lower loss
('IP',   1,    99,     5.0, 'IP small qty — 5% attrition'),
('IP',   100,  999,    3.0, 'IP medium qty — 3% attrition'),
('IP',   1000, NULL,   2.0, 'IP high qty — 2% attrition'),

-- TH through-hole: low loss
('TH',   1,    99,     3.0, 'TH small qty — 3% attrition'),
('TH',   100,  999,    2.0, 'TH medium qty — 2% attrition'),
('TH',   1000, NULL,   1.0, 'TH high qty — 1% attrition'),

-- MANSMT manual SMT: no automated loss
('MANSMT', 1,  99,     3.0, 'MANSMT small qty — 3% attrition'),
('MANSMT', 100, NULL,  2.0, 'MANSMT medium/high qty — 2% attrition'),

-- MEC mechanical: essentially no loss
('MEC',  1,    99,     2.0, 'MEC small qty — 2% attrition'),
('MEC',  100,  NULL,   1.0, 'MEC medium/high qty — 1% attrition'),

-- Accs accessories: no automated loss
('Accs', 1,    99,     2.0, 'Accs small qty — 2% attrition'),
('Accs', 100,  NULL,   1.0, 'Accs medium/high qty — 1% attrition'),

-- CABLE wiring: no loss expected
('CABLE', 1,   NULL,   1.0, 'CABLE — 1% attrition'),

-- DEV B development boards: no loss
('DEV B', 1,   NULL,   1.0, 'DEV B — 1% attrition')

ON CONFLICT (m_code, qty_min) DO NOTHING;
