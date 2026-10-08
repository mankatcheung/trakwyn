//! Use-case factories, one module per domain. Each adds an `impl Container`
//! block, so wiring a new domain touches only its own file.

mod ai_features;
mod auth;
mod llm;
mod notes;
