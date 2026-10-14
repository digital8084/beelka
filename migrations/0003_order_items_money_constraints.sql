CREATE TABLE order_items (
  id UUID PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  quote_id UUID REFERENCES quotes(id) ON DELETE RESTRICT,
  provider TEXT NOT NULL,
  product_code TEXT,
  description_snapshot TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_amount_minor BIGINT NOT NULL CHECK (unit_amount_minor >= 0),
  total_amount_minor BIGINT NOT NULL CHECK (total_amount_minor >= 0),
  terms_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX order_items_order_idx ON order_items(order_id, created_at);

ALTER TABLE orders
  ADD CONSTRAINT orders_total_formula_check
  CHECK (total_minor = subtotal_minor + fees_minor - discount_minor);

ALTER TABLE orders
  ADD CONSTRAINT orders_discount_bound_check
  CHECK (discount_minor <= subtotal_minor + fees_minor);
