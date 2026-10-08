use std::cmp::Reverse;
use std::sync::Mutex;

use async_trait::async_trait;
use chrono::{DateTime, Utc};

use crate::domain::llm_usage_event::{LlmUsageEvent, LlmUsageSummary};
use crate::use_cases::clock::now;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::{LlmUsageEventRepository, RecordLlmUsageEventData};

#[derive(Default)]
pub struct FakeLlmUsageEventRepository {
    events: Mutex<Vec<LlmUsageEvent>>,
}

impl FakeLlmUsageEventRepository {
    pub fn with(events: Vec<LlmUsageEvent>) -> Self {
        Self { events: Mutex::new(events) }
    }

    pub fn all(&self) -> Vec<LlmUsageEvent> {
        self.events.lock().unwrap().clone()
    }
}

#[async_trait]
impl LlmUsageEventRepository for FakeLlmUsageEventRepository {
    async fn record(&self, data: RecordLlmUsageEventData) -> DomainResult<()> {
        let mut events = self.events.lock().unwrap();
        if events.iter().any(|event| event.id == data.id) {
            return Err(DomainError::internal("duplicate LlmUsageEvent id"));
        }
        events.push(LlmUsageEvent {
            id: data.id,
            user_id: data.user_id,
            provider: data.provider,
            model: data.model,
            prompt_tokens: data.prompt_tokens,
            completion_tokens: data.completion_tokens,
            cache_read_tokens: data.cache_read_tokens,
            cache_write_tokens: data.cache_write_tokens,
            estimated: data.estimated,
            created_at: now(),
        });
        Ok(())
    }

    async fn summarize_by_user_id(
        &self,
        user_id: &str,
        since: DateTime<Utc>,
    ) -> DomainResult<Vec<LlmUsageSummary>> {
        let mut summaries: Vec<LlmUsageSummary> = Vec::new();
        for event in self.all() {
            if event.user_id != user_id || event.created_at < since {
                continue;
            }
            let position = summaries
                .iter()
                .position(|summary| summary.provider == event.provider)
                .unwrap_or_else(|| {
                    summaries.push(LlmUsageSummary {
                        provider: event.provider.clone(),
                        request_count: 0,
                        prompt_tokens: 0,
                        completion_tokens: 0,
                        cache_read_tokens: 0,
                        cache_write_tokens: 0,
                        last_used_at: event.created_at,
                    });
                    summaries.len() - 1
                });
            let summary = &mut summaries[position];
            summary.request_count += 1;
            summary.prompt_tokens += i64::from(event.prompt_tokens);
            summary.completion_tokens += i64::from(event.completion_tokens);
            summary.cache_read_tokens += i64::from(event.cache_read_tokens.unwrap_or(0));
            summary.cache_write_tokens += i64::from(event.cache_write_tokens.unwrap_or(0));
            summary.last_used_at = summary.last_used_at.max(event.created_at);
        }
        summaries.sort_by_key(|summary| Reverse(summary.last_used_at));
        Ok(summaries)
    }
}
