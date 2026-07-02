insert into public.tony_tiny_home_models
  (name, square_feet, base_price, minimum_lot_size, utility_requirements, description, active)
values
  ('Tony 120 Studio', 120, null, 0.07, '["water","electricity"]',
    'Compact pad with 10 ft side setbacks.', true),
  ('Tony 140 Loft', 140, null, 0.09, '["water","electricity"]',
    'Small front porch and 12 ft side setbacks.', true),
  ('Tony 160 Classic', 160, null, 0.12, '["water","electricity","sewerSeptic"]',
    'Full utility run with 15 ft build envelope buffers.', true),
  ('Tony 200 Plus', 200, null, 0.16, '["water","electricity","sewerSeptic"]',
    'Larger pad, outdoor storage, and 20 ft frontage buffer.', true);
