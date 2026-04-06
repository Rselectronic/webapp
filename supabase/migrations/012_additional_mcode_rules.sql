-- Additional M-Code PAR rules (PAR-25 through PAR-48)
-- Uses actual m_code_rules table schema: rule_id, priority, layer, field_1, operator_1, value_1, assigned_m_code, description

INSERT INTO m_code_rules (rule_id, priority, layer, field_1, operator_1, value_1, assigned_m_code, description) VALUES
('PAR-25', 15, 2, 'description', 'regex', '\bpin\b.*\bcrimp\b', 'CABLE', 'Pin + Crimp keywords → CABLE'),
('PAR-26', 20, 2, 'description', 'regex', '(connector|header|socket).*surface mount', 'MANSMT', 'SMT connectors by description → MANSMT'),
('PAR-27', 21, 2, 'category', 'equals', 'Connectors, Interconnects', 'MANSMT', 'Connectors category → MANSMT'),
('PAR-28', 22, 2, 'description', 'regex', 'connector\s+header.*position', 'MANSMT', 'Connector header position → MANSMT'),
('PAR-29', 20, 2, 'description', 'contains', 'END LAUNCH SOLDER', 'TH', 'End Launch Solder connectors → TH'),
('PAR-30', 20, 2, 'description', 'regex', '(terminal\s+block|screw\s+terminal)', 'TH', 'Terminal blocks / screw terminals → TH'),
('PAR-31', 25, 2, 'description', 'regex', '(crystal|xtal|oscillator)', 'TH', 'TH crystals/oscillators → TH'),
('PAR-32', 25, 2, 'description', 'regex', '(crystal|xtal|oscillator)', 'IP', 'SMT crystals/oscillators → IP'),
('PAR-33', 20, 2, 'description', 'regex', '(transformer|inductor.*through.*hole)', 'TH', 'Transformers → TH'),
('PAR-34', 20, 2, 'description', 'contains', 'RELAY', 'TH', 'Relays → TH'),
('PAR-35', 22, 2, 'description', 'regex', '(electrolytic|aluminum\s+cap)', 'TH', 'Electrolytic capacitors → TH'),
('PAR-36', 22, 2, 'description', 'contains', 'FILM CAPACITOR', 'TH', 'Film capacitors → TH'),
('PAR-37', 25, 2, 'description', 'contains', 'FUSE', 'TH', 'Through-hole fuses → TH'),
('PAR-38', 25, 2, 'description', 'contains', 'FUSE', 'CP', 'SMT fuses → CP'),
('PAR-39', 23, 2, 'description', 'regex', '\bLED\b', 'TH', 'Through-hole LEDs → TH'),
('PAR-40', 23, 2, 'description', 'regex', '\bLED\b', 'CP', 'SMT LEDs → CP'),
('PAR-41', 18, 2, 'description', 'regex', '(test\s*point|TP\d)', 'MEC', 'Test points → MEC'),
('PAR-42', 15, 2, 'description', 'regex', '(mounting\s+hardware|pcb\s+mount|board\s+mount|clip|retainer)', 'MEC', 'Mounting hardware → MEC'),
('PAR-43', 22, 2, 'description', 'regex', '(rf\s+module|bluetooth|wifi|wi-fi|zigbee|lora|wireless)', 'MANSMT', 'RF/wireless modules → MANSMT'),
('PAR-44', 22, 2, 'description', 'regex', '(eeprom|flash|sram|dram|nor|nand|fram|memory)', 'IP', 'Memory ICs → IP'),
('PAR-45', 23, 2, 'description', 'regex', '(toroid|choke|common\s+mode)', 'MANSMT', 'Toroids/chokes → MANSMT'),
('PAR-46', 24, 2, 'description', 'regex', '(TO-220|TO-247|TO-252|TO-263|D2PAK|DPAK)', 'IP', 'Power packages → IP'),
('PAR-47', 22, 2, 'description', 'regex', '(potentiometer|trimmer|trimpot|variable\s+resistor)', 'TH', 'Potentiometers/trimmers → TH'),
('PAR-48', 53, 2, 'description', 'regex', '.*', 'CPEXP', 'Size range CPEXP fallback')
ON CONFLICT (rule_id) DO NOTHING;
