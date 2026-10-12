use std::sync::{Arc, Mutex};

use async_trait::async_trait;

use super::FakeApplicationRepository;
use crate::domain::offer::{Offer, OfferPeriod};
use crate::use_cases::clock::now;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::{CreateOfferData, OfferRepository, UpdateOfferData};

/// `find_all_by_user_id` joins to the applications fake given to
/// [`FakeOfferRepository::with_applications`]; without one, no offer has an
/// owner and it finds nothing.
#[derive(Default)]
pub struct FakeOfferRepository {
    offers: Mutex<Vec<Offer>>,
    applications: Option<Arc<FakeApplicationRepository>>,
}

impl FakeOfferRepository {
    pub fn with(offers: Vec<Offer>) -> Self {
        Self { offers: Mutex::new(offers), applications: None }
    }

    pub fn with_applications(mut self, applications: Arc<FakeApplicationRepository>) -> Self {
        self.applications = Some(applications);
        self
    }

    pub fn all(&self) -> Vec<Offer> {
        self.offers.lock().unwrap().clone()
    }

    fn matching(&self, keep: impl Fn(&Offer) -> bool) -> Vec<Offer> {
        self.all().into_iter().filter(|offer| keep(offer)).collect()
    }
}

#[async_trait]
impl OfferRepository for FakeOfferRepository {
    async fn find_all_by_application_id(&self, application_id: &str) -> DomainResult<Vec<Offer>> {
        Ok(self.matching(|offer| offer.application_id == application_id))
    }

    async fn count_by_application_id(&self, application_id: &str) -> DomainResult<i64> {
        Ok(self.find_all_by_application_id(application_id).await?.len() as i64)
    }

    async fn find_all_by_user_id(&self, user_id: &str) -> DomainResult<Vec<Offer>> {
        let applications = self.applications.as_ref().map(|a| a.all()).unwrap_or_default();
        Ok(self.matching(|offer| {
            applications.iter().any(|application| {
                application.id == offer.application_id
                    && application.user_id == user_id
                    && application.deleted_at.is_none()
            })
        }))
    }

    async fn find_by_id(&self, id: &str) -> DomainResult<Option<Offer>> {
        Ok(self.matching(|offer| offer.id == id).pop())
    }

    async fn create(&self, data: CreateOfferData) -> DomainResult<Offer> {
        let timestamp = now();
        let offer = Offer {
            id: data.id,
            application_id: data.application_id,
            base_salary: data.base_salary,
            bonus: data.bonus,
            equity: data.equity,
            benefits: data.benefits,
            cost_of_living_adjustment: data.cost_of_living_adjustment,
            currency: data.currency.unwrap_or_else(|| "USD".to_string()),
            period: data.period.unwrap_or(OfferPeriod::Yearly),
            notes: data.notes,
            created_at: timestamp,
            updated_at: timestamp,
        };
        self.offers.lock().unwrap().push(offer.clone());
        Ok(offer)
    }

    async fn update(&self, id: &str, data: UpdateOfferData) -> DomainResult<Offer> {
        let mut offers = self.offers.lock().unwrap();
        let offer = offers
            .iter_mut()
            .find(|offer| offer.id == id)
            .ok_or_else(|| DomainError::internal(format!("no offer {id:?} to update")))?;

        if let Some(base_salary) = data.base_salary {
            offer.base_salary = base_salary;
        }
        if let Some(bonus) = data.bonus {
            offer.bonus = bonus;
        }
        if let Some(equity) = data.equity {
            offer.equity = equity;
        }
        if let Some(benefits) = data.benefits {
            offer.benefits = benefits;
        }
        if let Some(cost_of_living_adjustment) = data.cost_of_living_adjustment {
            offer.cost_of_living_adjustment = cost_of_living_adjustment;
        }
        if let Some(currency) = data.currency {
            offer.currency = currency;
        }
        if let Some(period) = data.period {
            offer.period = period;
        }
        if let Some(notes) = data.notes {
            offer.notes = notes;
        }
        offer.updated_at = now();
        Ok(offer.clone())
    }

    async fn delete(&self, id: &str) -> DomainResult<()> {
        self.offers.lock().unwrap().retain(|offer| offer.id != id);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::application::Application;
    use crate::use_cases::test_support::application_owned_by;

    fn data(id: &str, application_id: &str) -> CreateOfferData {
        CreateOfferData {
            id: id.to_string(),
            application_id: application_id.to_string(),
            base_salary: 120_000,
            ..Default::default()
        }
    }

    #[tokio::test]
    async fn create_defaults_currency_and_period_and_update_can_null_a_column() {
        let repository = FakeOfferRepository::default();
        let created = repository
            .create(CreateOfferData { bonus: Some(10_000), ..data("o1", "app-1") })
            .await
            .unwrap();
        assert_eq!(created.currency, "USD");
        assert_eq!(created.period, OfferPeriod::Yearly);

        let updated = repository
            .update(
                "o1",
                UpdateOfferData {
                    bonus: Some(None),
                    period: Some(OfferPeriod::Monthly),
                    ..Default::default()
                },
            )
            .await
            .unwrap();

        assert_eq!(updated.bonus, None);
        assert_eq!(updated.period, OfferPeriod::Monthly);
        assert_eq!(updated.base_salary, 120_000);

        repository.delete("o1").await.unwrap();
        assert_eq!(repository.find_by_id("o1").await.unwrap(), None);
    }

    #[tokio::test]
    async fn a_users_offers_skip_foreign_and_trashed_applications() {
        let applications = Arc::new(FakeApplicationRepository::with(vec![
            application_owned_by("app-1", "user-1"),
            application_owned_by("app-foreign", "user-2"),
            Application {
                deleted_at: Some(now()),
                ..application_owned_by("app-trashed", "user-1")
            },
        ]));
        let repository = FakeOfferRepository::default().with_applications(applications);
        for (id, application_id) in [("o1", "app-1"), ("o2", "app-foreign"), ("o3", "app-trashed")]
        {
            repository.create(data(id, application_id)).await.unwrap();
        }

        let offers = repository.find_all_by_user_id("user-1").await.unwrap();

        assert_eq!(offers.len(), 1);
        assert_eq!(offers[0].id, "o1");
        assert_eq!(repository.count_by_application_id("app-trashed").await.unwrap(), 1);
    }
}
