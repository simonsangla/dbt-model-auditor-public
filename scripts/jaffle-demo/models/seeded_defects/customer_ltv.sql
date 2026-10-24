-- SEEDED DEFECT (auditor demo): a mart with no tests or docs that reads a raw source directly.
{{ config(materialized='table') }}
select o.customer_id, sum(p.amount) / 100 as lifetime_value
from {{ ref('stg_orders') }} o
join {{ source('jaffle_raw', 'raw_payments') }} p on p.order_id = o.order_id
group by 1
