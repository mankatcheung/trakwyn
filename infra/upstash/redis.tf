# The one Redis database apps/api uses in production (CACHE_PROVIDER=redis):
# the cache-aside layer, the rate limiter and the session blocklist.

import {
  for_each = var.database_import_id == null ? toset([]) : toset([var.database_import_id])
  to       = upstash_redis_database.this
  id       = each.value
}

resource "upstash_redis_database" "this" {
  database_name  = var.database_name
  region         = var.region
  primary_region = var.primary_region
  read_regions   = var.read_regions

  tls = true

  # No eviction. Every key the API writes carries a PX TTL (RedisCache,
  # RedisRateLimiter, RedisSessionBlocklist), so memory is bounded by the
  # TTLs already. With eviction on, a full database would drop keys early,
  # and a dropped blocklist key silently un-revokes a session for the rest
  # of its access token's lifetime. Without it, a full database fails
  # writes, which each of those paths already treats as fail-open and
  # counts (apps/api/CLAUDE.md, Metrics), so infra/axiom's monitors see it.
  eviction = false

  # Never moved to a bigger plan automatically: on the free tier, hitting a
  # quota throttles the database rather than starting to bill.
  auto_scale = false
  prod_pack  = false

  # No ip_allowlist: Cloud Run has no fixed egress IP without a NAT gateway,
  # so an allowlist would lock the API out. The REST token is the boundary.

  lifecycle {
    # A changed region or name replaces the database, which would drop every
    # key and rotate the token Cloud Run holds. Refuse rather than plan it.
    prevent_destroy = true

    # budget is a pay-as-you-go setting, and the database is on the free
    # tier. Leaving it out of the config alone would plan the imported value
    # back to null; ignoring it keeps Terraform from touching it either way.
    ignore_changes = [budget]
  }
}
