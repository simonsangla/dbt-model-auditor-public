-- Analytics view the Trust Sprint question pack queries (one row per order).
{{ config(materialized='view') }}
select
    o.order_id,
    o.customer_id,
    o.order_date,
    o.status,
    o.amount,
    o.coupon_amount
from {{ ref('orders') }} o
