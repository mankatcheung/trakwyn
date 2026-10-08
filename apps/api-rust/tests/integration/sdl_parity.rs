//! Holds this schema to the contract: `schema.graphql`, the SDL printed from
//! `apps/api`'s Pothos schema.
//!
//! Everything this schema exposes must match the contract exactly: names,
//! types, nullability, arguments, defaults, descriptions. What it does not
//! expose yet must be listed in `pending_operations.txt`, and that list may
//! only shrink: an operation that is implemented but still listed fails here,
//! and so does one that is missing but not listed.
//!
//! Regenerate the contract after changing `apps/api`'s schema: see the README.

use std::collections::{BTreeMap, BTreeSet};
use std::sync::Arc;

use async_graphql_parser::parse_schema;
use async_graphql_parser::types::{
    FieldDefinition, InputValueDefinition, TypeKind, TypeSystemDefinition,
};

use trakwyn_api::http::container::Container;
use trakwyn_api::http::graphql::build_schema;
use trakwyn_api::infrastructure::db::Db;

use crate::common::test_config;

const CONTRACT: &str = include_str!("../../schema.graphql");
const PENDING: &str = include_str!("pending_operations.txt");
const ROOT_TYPES: [&str; 2] = ["Query", "Mutation"];

/// One member of a type, reduced to what a client can observe.
#[derive(Debug, Clone, PartialEq, Eq)]
struct Member {
    signature: String,
    description: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct TypeShape {
    kind: &'static str,
    members: BTreeMap<String, Member>,
}

fn input_value(value: &InputValueDefinition) -> String {
    match &value.default_value {
        Some(default) => format!("{}: {} = {}", value.name.node, value.ty.node, default.node),
        None => format!("{}: {}", value.name.node, value.ty.node),
    }
}

fn field(field: &FieldDefinition) -> Member {
    let arguments: BTreeSet<String> =
        field.arguments.iter().map(|argument| input_value(&argument.node)).collect();
    let arguments = arguments.into_iter().collect::<Vec<_>>().join(", ");
    Member {
        signature: format!("({arguments}): {}", field.ty.node),
        description: field.description.as_ref().map(|text| text.node.trim().to_string()),
    }
}

/// Every type an SDL document defines, keyed by name. Directive and schema
/// definitions are not part of what a client queries, so they are skipped.
fn shapes(sdl: &str) -> BTreeMap<String, TypeShape> {
    let document = parse_schema(sdl).expect("SDL should parse");
    let mut shapes = BTreeMap::new();

    for definition in document.definitions {
        let TypeSystemDefinition::Type(definition) = definition else { continue };
        let definition = definition.node;
        let plain = |signature: String| Member { signature, description: None };

        let (kind, members) = match definition.kind {
            TypeKind::Scalar => ("scalar", BTreeMap::new()),
            TypeKind::Object(object) => (
                "type",
                object
                    .fields
                    .iter()
                    .map(|item| (item.node.name.node.to_string(), field(&item.node)))
                    .collect(),
            ),
            TypeKind::InputObject(input) => (
                "input",
                input
                    .fields
                    .iter()
                    .map(|item| (item.node.name.node.to_string(), plain(input_value(&item.node))))
                    .collect(),
            ),
            TypeKind::Enum(values) => (
                "enum",
                values
                    .values
                    .iter()
                    .map(|item| (item.node.value.node.to_string(), plain(String::new())))
                    .collect(),
            ),
            TypeKind::Interface(_) => ("interface", BTreeMap::new()),
            TypeKind::Union(_) => ("union", BTreeMap::new()),
        };
        shapes.insert(definition.name.node.to_string(), TypeShape { kind, members });
    }
    shapes
}

fn rust_shapes() -> BTreeMap<String, TypeShape> {
    // The schema is only printed, never executed, so the pool never connects.
    let pool = sqlx::postgres::PgPoolOptions::new()
        .connect_lazy("postgres://unused/unused")
        .expect("a lazy pool needs no server");
    let container = Arc::new(Container::new(test_config(), Db::from_pool(pool)).unwrap());
    shapes(&build_schema(container).sdl())
}

fn pending() -> BTreeSet<String> {
    PENDING
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with('#'))
        .map(str::to_string)
        .collect()
}

fn operations(shapes: &BTreeMap<String, TypeShape>) -> BTreeSet<String> {
    ROOT_TYPES
        .iter()
        .filter_map(|root| shapes.get(*root).map(|shape| (root, shape)))
        .flat_map(|(root, shape)| shape.members.keys().map(move |name| format!("{root}.{name}")))
        .collect()
}

#[tokio::test]
async fn every_exposed_operation_matches_the_contract() {
    let contract = shapes(CONTRACT);
    let rust = rust_shapes();

    let mut mismatches = Vec::new();
    for root in ROOT_TYPES {
        let Some(rust_root) = rust.get(root) else { continue };
        for (name, member) in &rust_root.members {
            match contract[root].members.get(name) {
                None => mismatches.push(format!("{root}.{name} is not in the contract")),
                Some(expected) if expected != member => mismatches.push(format!(
                    "{root}.{name}\n  contract: {expected:?}\n  rust:     {member:?}"
                )),
                Some(_) => {}
            }
        }
    }

    assert!(mismatches.is_empty(), "operations differ:\n{}", mismatches.join("\n"));
}

#[tokio::test]
async fn every_exposed_type_matches_the_contract() {
    let contract = shapes(CONTRACT);
    let rust = rust_shapes();

    let mut mismatches = Vec::new();
    for (name, shape) in &rust {
        // Root types are compared operation by operation above, and
        // introspection types (`__Schema`, ...) are not printed by either side.
        if ROOT_TYPES.contains(&name.as_str()) {
            continue;
        }
        match contract.get(name) {
            None => mismatches.push(format!("type {name} is not in the contract")),
            Some(expected) if expected != shape => {
                mismatches.push(format!("{name}\n  contract: {expected:?}\n  rust:     {shape:?}"))
            }
            Some(_) => {}
        }
    }

    assert!(mismatches.is_empty(), "types differ:\n{}", mismatches.join("\n"));
}

#[tokio::test]
async fn the_pending_list_is_exactly_what_is_not_ported_yet() {
    let contract = operations(&shapes(CONTRACT));
    let rust = operations(&rust_shapes());
    let pending = pending();

    let missing: BTreeSet<_> = contract.difference(&rust).cloned().collect();
    let unlisted: Vec<_> = missing.difference(&pending).collect();
    let stale: Vec<_> = pending.difference(&missing).collect();

    assert!(
        unlisted.is_empty(),
        "in the contract, not implemented, and not listed in pending_operations.txt: {unlisted:?}"
    );
    assert!(
        stale.is_empty(),
        "listed in pending_operations.txt but implemented (or not in the contract); remove: {stale:?}"
    );
}

#[tokio::test]
async fn nothing_in_the_contract_is_left_out_once_the_pending_list_is_empty() {
    if !pending().is_empty() {
        return;
    }
    let contract = shapes(CONTRACT);
    let rust = rust_shapes();
    let missing: Vec<_> = contract.keys().filter(|name| !rust.contains_key(*name)).collect();
    assert!(missing.is_empty(), "contract types this schema does not define: {missing:?}");
}
