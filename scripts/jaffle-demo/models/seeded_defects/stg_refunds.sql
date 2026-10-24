-- SEEDED DEFECT (auditor demo): a staging table whose filter matches nothing, so it builds with 0 rows.
{{ config(materialized='table') }}
select payment_id, order_id, amount
from {{ ref('stg_payments') }}
where payment_method = 'refund'
