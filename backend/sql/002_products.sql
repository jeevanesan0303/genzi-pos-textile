USE genzi_corner_pos;

-- Match the existing categories.id definition.
SELECT CONCAT(
  COLUMN_TYPE,
  IF(
    CHARACTER_SET_NAME IS NULL,
    '',
    CONCAT(
      ' CHARACTER SET ',
      CHARACTER_SET_NAME,
      ' COLLATE ',
      COLLATION_NAME
    )
  )
)
INTO @category_id_definition
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'categories'
  AND COLUMN_NAME = 'id';

SET @products_sql = CONCAT(
'CREATE TABLE products (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,

  name VARCHAR(150) NOT NULL,

  category_id ', @category_id_definition, ' NOT NULL,

  sku VARCHAR(6) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,

  brand VARCHAR(100) NOT NULL DEFAULT '''',
  size VARCHAR(50) NOT NULL DEFAULT '''',
  colour VARCHAR(50) NOT NULL DEFAULT '''',

  selling_price DECIMAL(12,2) NOT NULL,
  cost DECIMAL(12,2) NOT NULL,

  opening_stock INT UNSIGNED NOT NULL DEFAULT 0,
  stock INT UNSIGNED NOT NULL DEFAULT 0,
  reorder_minimum INT UNSIGNED NOT NULL DEFAULT 8,

  photo_path VARCHAR(100) DEFAULT NULL,

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_products_sku (sku),
  KEY idx_products_category (category_id),

  CONSTRAINT fk_products_category
    FOREIGN KEY (category_id)
    REFERENCES categories(id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,

  CONSTRAINT chk_products_sku
    CHECK (
      CHAR_LENGTH(sku) = 6
      AND sku REGEXP ''^[0-9]{6}$''
    ),

  CONSTRAINT chk_products_prices
    CHECK (selling_price >= 0 AND cost >= 0)

) ENGINE=InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci'
);

PREPARE create_products FROM @products_sql;
EXECUTE create_products;
DEALLOCATE PREPARE create_products;

GRANT SELECT, INSERT, UPDATE, DELETE
ON genzi_corner_pos.products
TO 'genzi_app'@'localhost';

GRANT SELECT
ON genzi_corner_pos.categories
TO 'genzi_app'@'localhost';

SHOW CREATE TABLE products;