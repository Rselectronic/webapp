-- Fix overage table to match exact Excel VBA absolute extras values.
-- Format: (qty_threshold, extras) means "at this board qty or above, add this many extra components"
-- These are ABSOLUTE numbers, NOT percentages.

DELETE FROM public.overage_table;

INSERT INTO public.overage_table (m_code, qty_threshold, extras) VALUES
-- CP: Chip Package (standard SMT, ~59% of components)
('CP',     1,   10),
('CP',     60,  30),
('CP',     100, 35),
('CP',     200, 40),
('CP',     300, 50),
('CP',     500, 60),

-- 0402: Small passives
('0402',   1,   50),
('0402',   60,  60),
('0402',   100, 70),
('0402',   200, 80),
('0402',   300, 100),
('0402',   500, 120),

-- IP: IC Package (large SMT, ~15%)
('IP',     1,   5),
('IP',     10,  5),
('IP',     20,  10),
('IP',     50,  15),
('IP',     100, 20),
('IP',     250, 20),

-- TH: Through-Hole (~12%)
('TH',     1,   1),
('TH',     10,  1),
('TH',     20,  2),
('TH',     50,  5),
('TH',     100, 5),
('TH',     250, 20),

-- 0201: Ultra-tiny passives (same tiers as 0402)
('0201',   1,   50),
('0201',   60,  60),
('0201',   100, 70),
('0201',   200, 80),
('0201',   300, 100),
('0201',   500, 120),

-- CPEXP: Expanded SMT (same tiers as CP)
('CPEXP',  1,   10),
('CPEXP',  60,  30),
('CPEXP',  100, 35),
('CPEXP',  200, 40),
('CPEXP',  300, 50),
('CPEXP',  500, 60),

-- MANSMT: Manual SMT
('MANSMT', 1,   5),
('MANSMT', 10,  5),
('MANSMT', 20,  10),
('MANSMT', 50,  15),
('MANSMT', 100, 20),

-- MEC: Mechanical
('MEC',    1,   2),
('MEC',    10,  2),
('MEC',    20,  3),
('MEC',    50,  5),

-- Accs: Accessories
('Accs',   1,   1),
('Accs',   10,  1),
('Accs',   20,  2),

-- CABLE: Wiring/Cables
('CABLE',  1,   1),

-- DEV B: Development boards (zero overage)
('DEV B',  1,   0)

ON CONFLICT (m_code, qty_threshold) DO UPDATE SET extras = EXCLUDED.extras;
