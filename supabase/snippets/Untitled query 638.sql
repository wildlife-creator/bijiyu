SELECT u.email, u.role, u.stripe_customer_id,
       s.plan_type, s.status, s.cancel_at_period_end,
       s.schedule_id, s.scheduled_plan_type
FROM users u
LEFT JOIN subscriptions s ON s.user_id = u.id
  AND s.status IN ('active','past_due')
ORDER BY u.email;