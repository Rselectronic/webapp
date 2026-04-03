-- Seed M-Code classification rules (PAR rules)
-- Layer 2 of the 3-layer classification pipeline

INSERT INTO m_code_rules (code, field, condition, value, m_code, priority, notes) VALUES

-- PAR-01: Ultra-tiny passives by CPC prefix
('PAR-01', 'cpc', 'starts_with', '0201', '0201', 10, 'Ultra-tiny passives: CPC starts with 0201'),

-- PAR-02: Small passives by CPC prefix
('PAR-02', 'cpc', 'starts_with', '0402', '0402', 10, 'Small passives: CPC starts with 0402'),

-- PAR-03: Resistors / capacitors / inductors general (CP)
('PAR-03', 'description', 'regex', '^(RES|CAP|IND|RESISTOR|CAPACITOR|INDUCTOR)', 'CP', 30, 'Standard passives by description prefix'),

-- PAR-04: Ferrite beads
('PAR-04', 'description', 'contains', 'FERRITE', 'CP', 25, 'Ferrite beads → CP'),

-- PAR-05: Crystal / oscillator
('PAR-05', 'description', 'regex', '(CRYSTAL|OSCILLATOR|XTAL)', 'CP', 25, 'Crystals and oscillators → CP'),

-- PAR-06: Diode / Zener
('PAR-06', 'description', 'regex', '(DIODE|ZENER|SCHOTTKY)', 'CP', 25, 'Diodes → CP'),

-- PAR-07: Small transistors / MOSFETs → CP
('PAR-07', 'description', 'regex', '^(TRANS|BJT|NPN|PNP|N-CHANNEL|P-CHANNEL)', 'CP', 28, 'Small transistors → CP'),

-- PAR-08: IC packages — large SMT
('PAR-08', 'description', 'regex', '(MICROCONTROLLER|MICROPROCESSOR|FPGA|DSP|MPU|MCU)', 'IP', 20, 'Large ICs → IP'),

-- PAR-09: Op-amps, comparators, logic ICs → IP
('PAR-09', 'description', 'regex', '(OP.AMP|COMPARATOR|LOGIC|BUFFER|GATE|FLIP.FLOP)', 'IP', 22, 'Logic/analog ICs → IP'),

-- PAR-10: Voltage regulators → IP
('PAR-10', 'description', 'regex', '(REGULATOR|LDO|VREG|PWM CONTROLLER)', 'IP', 22, 'Voltage regulators → IP'),

-- PAR-11: Connectors → TH by default
('PAR-11', 'description', 'regex', '(CONNECTOR|HEADER|SOCKET|TERMINAL BLOCK)', 'TH', 20, 'Connectors → TH'),

-- PAR-12: Pin headers specifically
('PAR-12', 'description', 'contains', 'PIN HEADER', 'TH', 25, 'Pin headers → TH'),

-- PAR-13: Transformers → TH
('PAR-13', 'description', 'regex', '(TRANSFORMER|INDUCTOR.*TH)', 'TH', 20, 'Transformers → TH'),

-- PAR-14: Electrolytic capacitors → TH
('PAR-14', 'description', 'regex', '(ELECTROLYTIC|ALUMINUM CAP)', 'TH', 22, 'Electrolytic caps → TH'),

-- PAR-15: Mechanical hardware
('PAR-15', 'description', 'regex', '(STANDOFF|SCREW|NUT|WASHER|SPACER|HEATSINK|BRACKET)', 'MEC', 15, 'Mechanical hardware'),

-- PAR-16: Wiring / cables
('PAR-16', 'description', 'regex', '(CABLE|WIRE|HARNESS|RIBBON)', 'CABLE', 15, 'Cables and wiring'),

-- PAR-17: Accessories
('PAR-17', 'description', 'regex', '(LABEL|STICKER|BAG|FOAM|TAPE)', 'Accs', 15, 'Accessories and packaging'),

-- PAR-18: Development / evaluation boards
('PAR-18', 'description', 'regex', '(DEV BOARD|EVAL BOARD|BREAKOUT|RASPBERRY PI|ARDUINO)', 'DEV B', 15, 'Development boards'),

-- PAR-19: Manual SMT (large or odd-form SMT)
('PAR-19', 'description', 'regex', '(TOROID|LARGE SMT|MANUAL)', 'MANSMT', 20, 'Manual SMT parts'),

-- PAR-20: SMT LEDs → CP
('PAR-20', 'description', 'regex', '^LED', 'CP', 22, 'LEDs → CP'),

-- PAR-21: Fuses → CP
('PAR-21', 'description', 'contains', 'FUSE', 'CP', 22, 'Fuses → CP'),

-- PAR-22: Test points → MEC
('PAR-22', 'description', 'regex', '(TEST POINT|TP)', 'MEC', 18, 'Test points → MEC'),

-- PAR-23: Memory ICs → IP
('PAR-23', 'description', 'regex', '(EEPROM|FLASH|SRAM|DRAM|NOR|NAND|FRAM)', 'IP', 22, 'Memory ICs → IP'),

-- PAR-24: RF modules → MANSMT
('PAR-24', 'description', 'regex', '(RF MODULE|BLUETOOTH|WIFI|ZIGBEE|LORA)', 'MANSMT', 22, 'RF modules → MANSMT')

ON CONFLICT (code) DO NOTHING;
