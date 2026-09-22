# Helix (video-director) Docker bundle

This repo already ships its own Dockerfiles, docker-entrypoint.sh, nginx.conf and
docker-compose.yml -- they're carried through here unchanged after testing. Only
two things were wrong, both fixed in this bundle:

1. server/prisma/migrations/20260906084944_mg5 renamed to
   20260906190000_mg5 -- it alters 5 tables (research_claims, research_plans,
   research_evidence, research_verifications, research_conflicts) that are only
   CREATEd by 20260906180000_m17_research_graph, which has a LATER timestamp
   folder name but needs to run FIRST. Confirmed: with the old name, applying
   all 13 migrations to a fresh MySQL 8 database failed at mg5 with
   `Table 'helix.research_conflicts' doesn't exist`. Renamed, all 13 apply
   cleanly in order.
2. .env.example's SHARED_MYSQL_NETWORK default corrected from the repo's
   guessed "mysql_shared_net" to "shared_net" -- the actual external network
   name from your shared-infra setup.

Copy this bundle's files over the repo root (same relative paths), keeping
your own copy of anything you've already customized.
