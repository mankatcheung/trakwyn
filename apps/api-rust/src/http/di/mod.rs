//! Use-case factories, one module per domain. Each adds an `impl Container`
//! block, so wiring a new domain touches only its own file.

mod auth;
mod contacts;
mod interview_rounds;
mod notes;
mod offers;
