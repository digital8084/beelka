CREATE FUNCTION reject_append_only_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only; % is not allowed', TG_TABLE_NAME, TG_OP
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER audit_events_append_only
BEFORE UPDATE OR DELETE ON audit_events
FOR EACH ROW EXECUTE FUNCTION reject_append_only_event_mutation();

CREATE TRIGGER order_events_append_only
BEFORE UPDATE OR DELETE ON order_events
FOR EACH ROW EXECUTE FUNCTION reject_append_only_event_mutation();
