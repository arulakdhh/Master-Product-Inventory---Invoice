-- =====================================================================
-- Implant Product Register: relational schema (MySQL / MariaDB 10.3+)
-- =====================================================================
-- The live app stores JSON documents in the claude.ai artifact database
-- (see README.md, "How the database works"). This file is the same data
-- laid out as SQL tables, for running the app on your own server or
-- connecting it to your existing website.
--
-- The "Download SQL (MySQL)" button in the app (Export & connect tab)
-- produces INSERT/REPLACE statements for the tables marked [EXPORTED].
-- The other tables hold data the export doesn't include yet.
-- =====================================================================

SET NAMES utf8mb4;

-- ---------------------------------------------------------------------
-- Purchase side
-- ---------------------------------------------------------------------

-- [EXPORTED] One row per supplier invoice. DB doc: invoices/{invoiceNo}
CREATE TABLE IF NOT EXISTS invoices (
  invoice_no        VARCHAR(40)  PRIMARY KEY,
  invoice_date      DATE,
  supplier          VARCHAR(200),
  supplier_gstin    VARCHAR(20),
  buyer             VARCHAR(200),
  buyer_gstin       VARCHAR(20),
  dc_no             VARCHAR(40),
  so_no             VARCHAR(40),
  invoice_value     DECIMAL(14,2),
  printed_basic     DECIMAL(14,2),   -- footer totals printed on the PDF
  printed_discount  DECIMAL(14,2),
  printed_taxable   DECIMAL(14,2),
  printed_igst      DECIMAL(14,2),
  line_count        INT,
  source_file       VARCHAR(255),
  imported_at       VARCHAR(40)
);

-- [EXPORTED] One row per invoice line (one batch / serial).
-- DB docs: chunks/{invoiceNo}_{000} hold up to 100 of these rows each.
-- dhh_product_id / division_* come from registry/{invoiceNo}.
CREATE TABLE IF NOT EXISTS invoice_items (
  invoice_no        VARCHAR(40)  NOT NULL,
  sr_no             INT          NOT NULL,
  dhh_product_id    VARCHAR(20),          -- e.g. MHC01; permanent, never reused
  division_code     VARCHAR(10),          -- MLS / MHC / MED / MDG / …
  division_name     VARCHAR(100),
  hsn_code          VARCHAR(12),
  material_code     VARCHAR(60)  NOT NULL,
  description       VARCHAR(400),
  batch_no          VARCHAR(40),
  serial_no         VARCHAR(40),
  expiry_date       DATE,
  uom               VARCHAR(10),
  qty               DECIMAL(12,3),
  mrp               DECIMAL(14,2),
  rate              DECIMAL(14,2),
  basic_amount      DECIMAL(14,2),
  discount_amount   DECIMAL(14,2),
  freight           DECIMAL(14,2),
  taxable_amount    DECIMAL(14,2),
  igst_rate         DECIMAL(5,2),
  igst_amount       DECIMAL(14,2),
  qty_sold          DECIMAL(12,3),        -- computed: active invoices + challans
  qty_available     DECIMAL(12,3),        -- computed: qty - qty_sold
  PRIMARY KEY (invoice_no, sr_no),
  UNIQUE KEY uq_dhh_product_id (dhh_product_id),
  KEY idx_division (division_code),
  KEY idx_material (material_code),
  KEY idx_batch (batch_no),
  KEY idx_serial (serial_no)
);

-- ---------------------------------------------------------------------
-- PID system (not in the export yet; the app keeps it in registry/ and settings/)
-- ---------------------------------------------------------------------

-- DB doc: settings/divisions  {list:[{code,name}]}
CREATE TABLE IF NOT EXISTS divisions (
  code  VARCHAR(10)  PRIMARY KEY,
  name  VARCHAR(100) NOT NULL
);
INSERT IGNORE INTO divisions VALUES
  ('MLS','Meril Life Sciences'), ('MHC','Meril Healthcare'),
  ('MED','Meril Endo'),          ('MDG','Meril Diagnostics');

-- DB doc: settings/counters {counts:{MLS:833, MHC:321, …}}
-- The last number issued per division. Only ever goes up.
CREATE TABLE IF NOT EXISTS pid_counters (
  division_code  VARCHAR(10) PRIMARY KEY,
  last_number    INT NOT NULL DEFAULT 0
);

-- DB doc: registry/{invoiceNo}.retired[]  PIDs of deleted lines/invoices.
CREATE TABLE IF NOT EXISTS retired_pids (
  dhh_product_id  VARCHAR(20) PRIMARY KEY,
  division_code   VARCHAR(10),
  invoice_no      VARCHAR(40),
  sr_no           INT,
  material_code   VARCHAR(60),
  batch_no        VARCHAR(40),
  serial_no       VARCHAR(40),
  reason          VARCHAR(40),          -- 'invoice deleted' | 'line deleted'
  issued_at       VARCHAR(40),
  retired_at      VARCHAR(40)
);

-- ---------------------------------------------------------------------
-- Sales side
-- ---------------------------------------------------------------------

-- [EXPORTED] DB doc: sales/{TYPE}_{FY}_{SEQ}, e.g. sales/INV_26-27_0001
CREATE TABLE IF NOT EXISTS sales_documents (
  doc_id              VARCHAR(40) PRIMARY KEY,
  doc_no              VARCHAR(40) UNIQUE,     -- DHH/26-27/0001, DHH/QTN/26-27/0001, DHH/DC/26-27/0001
  doc_type            VARCHAR(4),             -- INV | QTN | DC
  doc_date            DATE,
  status              VARCHAR(12),            -- INV: active|cancelled  QTN: open|converted|cancelled  DC: open|billed|cancelled
  customer_name       VARCHAR(200),
  customer_gstin      VARCHAR(20),
  customer_state      VARCHAR(4),
  customer_address    VARCHAR(400),
  taxable             DECIMAL(14,2),
  cgst                DECIMAL(14,2),
  sgst                DECIMAL(14,2),
  igst                DECIMAL(14,2),
  round_off           DECIMAL(8,2),
  grand_total         DECIMAL(14,2),
  ref_doc_no          VARCHAR(40),            -- quotation or challan it came from
  additional_details  TEXT,                   -- JSON [{label,value}]
  notes               TEXT,
  created_at          VARCHAR(40)
);

-- [EXPORTED]
CREATE TABLE IF NOT EXISTS sales_items (
  doc_id               VARCHAR(40) NOT NULL,
  line_no              INT NOT NULL,
  dhh_product_id       VARCHAR(20),
  purchase_invoice_no  VARCHAR(40),           -- links to invoice_items
  purchase_sr_no       INT,
  material_code        VARCHAR(60),
  description          VARCHAR(400),
  hsn_code             VARCHAR(12),
  batch_no             VARCHAR(40),
  serial_no            VARCHAR(40),
  expiry_date          DATE,
  qty                  DECIMAL(12,3),
  rate                 DECIMAL(14,2),
  disc_pct             DECIMAL(6,2),
  taxable              DECIMAL(14,2),
  gst_rate             DECIMAL(5,2),
  cgst                 DECIMAL(14,2),
  sgst                 DECIMAL(14,2),
  igst                 DECIMAL(14,2),
  total                DECIMAL(14,2),
  remarks              VARCHAR(255),
  PRIMARY KEY (doc_id, line_no),
  KEY idx_pid (dhh_product_id)
);

-- DB doc: customers/{id}
CREATE TABLE IF NOT EXISTS customers (
  id          VARCHAR(40) PRIMARY KEY,
  name        VARCHAR(200) NOT NULL,
  address     VARCHAR(400),
  gstin       VARCHAR(20),
  state_code  VARCHAR(4),
  state_name  VARCHAR(60),
  dl_no       VARCHAR(100),
  phone       VARCHAR(40)
);

-- DB doc: settings/salescounters {counts:{"INV_26-27":2, "QTN_26-27":1, …}}
CREATE TABLE IF NOT EXISTS sales_counters (
  counter_key  VARCHAR(20) PRIMARY KEY,     -- {TYPE}_{FY}
  last_number  INT NOT NULL DEFAULT 0
);

-- ---------------------------------------------------------------------
-- Live stock per PID (same rule the app uses)
-- A line reduces stock if: challan not cancelled, OR invoice active and not made from a challan.
-- (The app stores "made from a challan" as fromDc; in SQL, ref_doc_no LIKE 'DHH/DC/%'.)
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW stock_by_pid AS
SELECT i.dhh_product_id, i.division_code, i.material_code, i.description,
       i.batch_no, i.serial_no, i.expiry_date, i.qty AS qty_received,
       COALESCE(SUM(CASE
         WHEN d.doc_type = 'DC'  AND d.status <> 'cancelled' THEN s.qty
         WHEN d.doc_type = 'INV' AND d.status = 'active'
              AND (d.ref_doc_no IS NULL OR d.ref_doc_no NOT LIKE 'DHH/DC/%') THEN s.qty
         ELSE 0 END), 0) AS qty_sold,
       i.qty - COALESCE(SUM(CASE
         WHEN d.doc_type = 'DC'  AND d.status <> 'cancelled' THEN s.qty
         WHEN d.doc_type = 'INV' AND d.status = 'active'
              AND (d.ref_doc_no IS NULL OR d.ref_doc_no NOT LIKE 'DHH/DC/%') THEN s.qty
         ELSE 0 END), 0) AS qty_available
FROM invoice_items i
LEFT JOIN sales_items s ON s.purchase_invoice_no = i.invoice_no AND s.purchase_sr_no = i.sr_no
LEFT JOIN sales_documents d ON d.doc_id = s.doc_id
GROUP BY i.invoice_no, i.sr_no;
