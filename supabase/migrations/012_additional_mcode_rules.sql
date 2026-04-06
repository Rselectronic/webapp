-- Additional M-Code PAR rules (PAR-25 through PAR-48)
-- Derived from VBA Admin sheet logic in DM Common File V11
-- These cover connector classification, component-type rules, and corrected size ranges.

-- First, ensure the m_code_rules table has the right schema.
-- The migration 003 used columns: code, field, condition, value, m_code, priority, notes
-- We insert using that same schema.

INSERT INTO m_code_rules (code, field, condition, value, m_code, priority, notes) VALUES

-- PAR-25: Pin + Crimp → CABLE (crimped pin contacts for wiring)
('PAR-25', 'description', 'regex', '\bpin\b.*\bcrimp\b', 'CABLE', 15, 'Pin + Crimp keywords in description → CABLE'),

-- PAR-26: SMT connectors (category Connectors + description Surface Mount) → MANSMT
('PAR-26', 'description', 'regex', '(connector|header|socket).*surface mount', 'MANSMT', 20, 'SMT connectors by description → MANSMT'),

-- PAR-27: SMT connectors by category + mounting type → MANSMT
('PAR-27', 'category', 'equals', 'Connectors, Interconnects', 'MANSMT', 21, 'Connectors category + SMT mounting → MANSMT (requires Surface Mount mounting check)'),

-- PAR-28: Connector Header position with SMT → MANSMT
('PAR-28', 'description', 'regex', 'connector\s+header.*position', 'MANSMT', 22, 'Connector header position with SMT mounting → MANSMT'),

-- PAR-29: End Launch Solder → TH
('PAR-29', 'description', 'contains', 'END LAUNCH SOLDER', 'TH', 20, 'End Launch Solder connectors → TH'),

-- PAR-30: Terminal blocks / screw terminals → TH
('PAR-30', 'description', 'regex', '(terminal\s+block|screw\s+terminal)', 'TH', 20, 'Terminal blocks and screw terminals → TH'),

-- PAR-31: TH crystals/oscillators → TH
('PAR-31', 'description', 'regex', '(crystal|xtal|oscillator)', 'TH', 25, 'Through-hole crystals/oscillators → TH (requires TH mounting check)'),

-- PAR-32: SMT crystals/oscillators → IP
('PAR-32', 'description', 'regex', '(crystal|xtal|oscillator)', 'IP', 25, 'SMT crystals/oscillators → IP (requires SMT mounting check)'),

-- PAR-33: Transformers → TH
('PAR-33', 'description', 'regex', '(transformer|inductor.*through.*hole)', 'TH', 20, 'Transformers and TH inductors → TH'),

-- PAR-34: Relays → TH
('PAR-34', 'description', 'contains', 'RELAY', 'TH', 20, 'Relays → TH'),

-- PAR-35: Electrolytic / aluminum capacitors → TH
('PAR-35', 'description', 'regex', '(electrolytic|aluminum\s+cap)', 'TH', 22, 'Electrolytic / aluminum capacitors → TH'),

-- PAR-36: Film capacitors with chassis/stud/TH mounting → TH
('PAR-36', 'description', 'contains', 'FILM CAPACITOR', 'TH', 22, 'Film capacitors with chassis/TH mounting → TH'),

-- PAR-37: Through-hole fuses → TH
('PAR-37', 'description', 'contains', 'FUSE', 'TH', 25, 'Through-hole fuses → TH (requires TH mounting check)'),

-- PAR-38: SMT fuses → CP
('PAR-38', 'description', 'contains', 'FUSE', 'CP', 25, 'SMT fuses → CP (requires SMT mounting check)'),

-- PAR-39: Through-hole LEDs → TH
('PAR-39', 'description', 'regex', '\bLED\b', 'TH', 23, 'Through-hole LEDs → TH (requires TH mounting check)'),

-- PAR-40: SMT LEDs → CP
('PAR-40', 'description', 'regex', '\bLED\b', 'CP', 23, 'SMT LEDs → CP (requires SMT mounting check)'),

-- PAR-41: Test points → MEC
('PAR-41', 'description', 'regex', '(test\s*point|TP\d)', 'MEC', 18, 'Test points → MEC'),

-- PAR-42: Mounting hardware / clips → MEC
('PAR-42', 'description', 'regex', '(mounting\s+hardware|pcb\s+mount|board\s+mount|clip|retainer)', 'MEC', 15, 'Mounting hardware / clips / retainers → MEC'),

-- PAR-43: RF/wireless modules → MANSMT
('PAR-43', 'description', 'regex', '(rf\s+module|bluetooth|wifi|wi-fi|zigbee|lora|wireless)', 'MANSMT', 22, 'RF/wireless modules → MANSMT'),

-- PAR-44: SMT memory ICs → IP
('PAR-44', 'description', 'regex', '(eeprom|flash|sram|dram|nor|nand|fram|memory)', 'IP', 22, 'SMT memory ICs → IP'),

-- PAR-45: Toroids / common mode chokes → MANSMT
('PAR-45', 'description', 'regex', '(toroid|choke|common\s+mode)', 'MANSMT', 23, 'Toroids / common mode chokes → MANSMT'),

-- PAR-46: Power packages (TO-220, D2PAK, etc.) → IP
('PAR-46', 'description', 'regex', '(TO-220|TO-247|TO-252|TO-263|D2PAK|DPAK)', 'IP', 24, 'Power packages → IP'),

-- PAR-47: Potentiometers / trimmers → TH
('PAR-47', 'description', 'regex', '(potentiometer|trimmer|trimpot|variable\s+resistor)', 'TH', 22, 'Potentiometers / trimmers → TH'),

-- PAR-48: Size range CPEXP (L 3.8-4.29 x W 3.6-3.99) — added to close gap in size table
('PAR-48', 'description', 'regex', '.*', 'CPEXP', 53, 'Size range CPEXP — evaluated via size-based engine, not description regex')

ON CONFLICT (code) DO NOTHING;
