// Runs before the integration test module and its application-service imports.
// Application pools must never connect to existing databases in this process.
process.env.SOURCEASIA_INTEGRATION_TESTS = "true";
process.env.NOTIFICATION_ORDERS_EMAIL = "staff@sourceasia-integration.invalid";
process.env.NOTIFICATION_SUPPORT_EMAIL = "support@sourceasia-integration.invalid";
