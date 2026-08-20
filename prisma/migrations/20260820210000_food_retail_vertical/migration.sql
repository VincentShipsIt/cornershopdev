-- FOOD_RETAIL reuses the existing Site/CatalogSection/CatalogItem JSON
-- attribute bags. This additive enum value is the only physical schema change;
-- no existing row is rewritten and no product, price, availability or allergen
-- data is manufactured during migration.
ALTER TYPE "Vertical" ADD VALUE 'FOOD_RETAIL';
