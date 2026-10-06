//! Dependency wiring: one implementation chosen for every port.
//!
//! Repositories and services are built once and shared (the `SINGLETON`s of
//! `apps/api`'s Awilix container). Use cases are built per call by the
//! factory methods in `http::di`, one module per domain (its `TRANSIENT`s).

use std::sync::Arc;

use crate::config::Config;
use crate::http::cookies::AuthCookies;
use crate::infrastructure::auth::JwtTokenService;
use crate::infrastructure::db::repositories::{
    PgActivityLogRepository, PgApplicationRepository, PgNoteRepository,
};
use crate::infrastructure::db::Db;
use crate::infrastructure::session_blocklist::MemorySessionBlocklist;
use crate::use_cases::ids::{nanoid_generator, GenerateId};
use crate::use_cases::ports::{
    ActivityLogRepository, ApplicationRepository, NoteRepository, SessionBlocklist, TokenService,
};

pub struct Container {
    pub config: Arc<Config>,
    pub db: Db,
    pub auth_cookies: AuthCookies,
    pub generate_id: GenerateId,
    pub token_service: Arc<dyn TokenService>,
    pub session_blocklist: Arc<dyn SessionBlocklist>,
    pub activity_log_repository: Arc<dyn ActivityLogRepository>,
    pub application_repository: Arc<dyn ApplicationRepository>,
    pub note_repository: Arc<dyn NoteRepository>,
}

impl Container {
    pub fn new(config: Config, db: Db) -> Self {
        Self {
            auth_cookies: AuthCookies::new(&config),
            generate_id: nanoid_generator(),
            token_service: Arc::new(JwtTokenService::new(
                &config.jwt_secret,
                &config.jwt_refresh_secret,
            )),
            session_blocklist: Arc::new(MemorySessionBlocklist::default()),
            activity_log_repository: Arc::new(PgActivityLogRepository::new(db.clone())),
            application_repository: Arc::new(PgApplicationRepository::new(db.clone())),
            note_repository: Arc::new(PgNoteRepository::new(db.clone())),
            config: Arc::new(config),
            db,
        }
    }
}
