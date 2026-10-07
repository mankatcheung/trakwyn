use std::net::SocketAddr;
use std::process::ExitCode;
use std::sync::Arc;
use std::time::Duration;

use sqlx::Connection;
use tokio::net::TcpListener;
use tokio::signal::unix::{signal, SignalKind};

use trakwyn_api::config::Config;
use trakwyn_api::http::app::build_router;
use trakwyn_api::http::constants::SERVER_CLOSE_TIMEOUT_MS;
use trakwyn_api::http::container::Container;
use trakwyn_api::infrastructure::db::migrations::{apply_migrations, default_migrations_dir};
use trakwyn_api::infrastructure::db::Db;

type BoxError = Box<dyn std::error::Error + Send + Sync>;

fn init_logging(config: &Config) {
    // Production logs at `warn` as NDJSON, which is what Cloud Logging
    // collects; dev gets readable lines at `info`. `RUST_LOG` overrides both.
    let default_level = if config.is_production() { "warn" } else { "info" };
    let filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new(default_level));
    let builder = tracing_subscriber::fmt().with_env_filter(filter);
    if config.is_production() {
        builder.json().init();
    } else {
        builder.init();
    }
}

async fn shutdown_signal() {
    let mut terminate = match signal(SignalKind::terminate()) {
        Ok(terminate) => terminate,
        Err(err) => {
            tracing::error!(error = %err, "cannot listen for SIGTERM");
            return std::future::pending().await;
        }
    };
    tokio::select! {
        _ = terminate.recv() => {}
        _ = tokio::signal::ctrl_c() => {}
    }
}

async fn migrate(config: &Config) -> Result<(), BoxError> {
    let mut conn = sqlx::PgConnection::connect(&config.database_url).await?;
    let summary = apply_migrations(&mut conn, &default_migrations_dir()).await?;
    println!("Migrations complete: {} applied, {} skipped", summary.applied, summary.skipped);
    Ok(())
}

async fn serve(config: Config) -> Result<(), BoxError> {
    let port = config.port;
    let db = Db::connect(&config.database_url).await?;
    let router = build_router(Arc::new(Container::new(config, db.clone())?));

    let listener = TcpListener::bind(SocketAddr::from(([0, 0, 0, 0], port))).await?;
    tracing::info!("API server listening on http://localhost:{port}");

    let server = axum::serve(listener, router.into_make_service_with_connect_info::<SocketAddr>())
        .with_graceful_shutdown(shutdown_signal());
    server.await?;

    db.close(Duration::from_millis(SERVER_CLOSE_TIMEOUT_MS)).await;
    Ok(())
}

async fn run() -> Result<(), BoxError> {
    // A missing `.env` is normal in production, where the platform sets the
    // environment directly.
    let _ = dotenvy::dotenv();
    let config = Config::from_env()?;
    init_logging(&config);

    match std::env::args().nth(1).as_deref() {
        None | Some("serve") => serve(config).await,
        Some("migrate") => migrate(&config).await,
        Some(other) => {
            Err(format!("unknown command {other:?}; expected `serve` or `migrate`").into())
        }
    }
}

#[tokio::main]
async fn main() -> ExitCode {
    match run().await {
        Ok(()) => ExitCode::SUCCESS,
        Err(err) => {
            eprintln!("trakwyn-api: {err}");
            ExitCode::FAILURE
        }
    }
}
