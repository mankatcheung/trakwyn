use std::sync::Arc;

use chrono::{DateTime, Utc};

use super::normalize::normalize_to_yearly;
use super::*;
use crate::domain::application::Application;
use crate::domain::offer::{Offer, OfferPeriod};
use crate::use_cases::errors::ErrorCode;
use crate::use_cases::test_support::{
    application_owned_by, sequential_ids, FakeApplicationRepository, FakeOfferRepository,
};

const OWNER: &str = "user-owner";
const STRANGER: &str = "user-stranger";
const APPLICATION: &str = "app-1";

struct Fixture {
    applications: Arc<FakeApplicationRepository>,
    offers: Arc<FakeOfferRepository>,
}

impl Fixture {
    fn new(offers: Vec<Offer>) -> Self {
        Self::with_applications(vec![application_owned_by(APPLICATION, OWNER)], offers)
    }

    fn with_applications(applications: Vec<Application>, offers: Vec<Offer>) -> Self {
        let applications = Arc::new(FakeApplicationRepository::with(applications));
        Self {
            offers: Arc::new(
                FakeOfferRepository::with(offers).with_applications(applications.clone()),
            ),
            applications,
        }
    }

    fn create(&self) -> CreateOfferUseCase {
        CreateOfferUseCase {
            offer_repository: self.offers.clone(),
            application_repository: self.applications.clone(),
            generate_offer_id: sequential_ids("offer"),
        }
    }

    fn get(&self) -> GetOffersUseCase {
        GetOffersUseCase {
            offer_repository: self.offers.clone(),
            application_repository: self.applications.clone(),
        }
    }

    fn get_all(&self) -> GetAllOffersUseCase {
        GetAllOffersUseCase {
            offer_repository: self.offers.clone(),
            application_repository: self.applications.clone(),
        }
    }

    fn update(&self) -> UpdateOfferUseCase {
        UpdateOfferUseCase {
            offer_repository: self.offers.clone(),
            application_repository: self.applications.clone(),
        }
    }

    fn delete(&self) -> DeleteOfferUseCase {
        DeleteOfferUseCase {
            offer_repository: self.offers.clone(),
            application_repository: self.applications.clone(),
        }
    }

    fn compare(&self) -> CompareOffersUseCase {
        CompareOffersUseCase {
            offer_repository: self.offers.clone(),
            application_repository: self.applications.clone(),
        }
    }

    fn analytics(&self) -> GetOfferAnalyticsUseCase {
        GetOfferAnalyticsUseCase {
            offer_repository: self.offers.clone(),
            application_repository: self.applications.clone(),
        }
    }
}

fn at(seconds: i64) -> DateTime<Utc> {
    DateTime::<Utc>::from_timestamp(seconds, 0).unwrap()
}

fn offer(id: &str, application_id: &str, base_salary: i64, period: OfferPeriod) -> Offer {
    Offer {
        id: id.to_string(),
        application_id: application_id.to_string(),
        base_salary,
        bonus: None,
        equity: None,
        benefits: None,
        cost_of_living_adjustment: None,
        currency: "USD".to_string(),
        period,
        notes: None,
        created_at: at(100),
        updated_at: at(100),
    }
}

fn application(id: &str, company: &str, role: &str) -> Application {
    Application {
        company: company.to_string(),
        role: role.to_string(),
        ..application_owned_by(id, OWNER)
    }
}

#[test]
fn normalizes_each_period_to_a_year() {
    assert_eq!(normalize_to_yearly(100, OfferPeriod::Yearly), 100);
    assert_eq!(normalize_to_yearly(100, OfferPeriod::Monthly), 1_200);
    assert_eq!(normalize_to_yearly(100, OfferPeriod::Weekly), 5_200);
    assert_eq!(normalize_to_yearly(100, OfferPeriod::Hourly), 208_000);
    assert_eq!(normalize_to_yearly(i64::MAX, OfferPeriod::Hourly), i64::MAX);
}

mod create {
    use super::*;

    fn input(user_id: &str, application_id: &str) -> CreateOfferInput {
        CreateOfferInput {
            user_id: user_id.to_string(),
            application_id: application_id.to_string(),
            base_salary: 120_000,
            ..Default::default()
        }
    }

    #[tokio::test]
    async fn stores_the_offer_with_the_default_currency_and_period() {
        let fixture = Fixture::new(vec![]);

        let created = fixture.create().execute(input(OWNER, APPLICATION)).await.unwrap();

        assert_eq!(created.id, "offer-1");
        assert_eq!(created.application_id, APPLICATION);
        assert_eq!(created.base_salary, 120_000);
        assert_eq!(created.bonus, None);
        assert_eq!(created.currency, "USD");
        assert_eq!(created.period, OfferPeriod::Yearly);
        assert_eq!(fixture.offers.all(), vec![created]);
    }

    #[tokio::test]
    async fn passes_explicit_fields_through() {
        let fixture = Fixture::new(vec![]);

        let created = fixture
            .create()
            .execute(CreateOfferInput {
                bonus: Some(10_000),
                equity: Some("0.1%".to_string()),
                benefits: Some("Health".to_string()),
                cost_of_living_adjustment: Some(5),
                currency: Some("EUR".to_string()),
                period: Some("monthly".to_string()),
                notes: Some("Verbal".to_string()),
                ..input(OWNER, APPLICATION)
            })
            .await
            .unwrap();

        assert_eq!(created.bonus, Some(10_000));
        assert_eq!(created.equity.as_deref(), Some("0.1%"));
        assert_eq!(created.benefits.as_deref(), Some("Health"));
        assert_eq!(created.cost_of_living_adjustment, Some(5));
        assert_eq!(created.currency, "EUR");
        assert_eq!(created.period, OfferPeriod::Monthly);
        assert_eq!(created.notes.as_deref(), Some("Verbal"));
    }

    #[tokio::test]
    async fn a_missing_application_and_someone_elses_both_read_as_not_found() {
        let fixture = Fixture::new(vec![]);

        for (user, application_id) in [(OWNER, "missing"), (STRANGER, APPLICATION)] {
            let err = fixture.create().execute(input(user, application_id)).await.unwrap_err();
            assert_eq!(err.code(), ErrorCode::NotFound);
            assert_eq!(err.to_string(), "Application not found");
        }
        assert!(fixture.offers.all().is_empty());
    }

    #[tokio::test]
    async fn refuses_a_period_outside_the_known_set() {
        let fixture = Fixture::new(vec![]);

        let err = fixture
            .create()
            .execute(CreateOfferInput {
                period: Some("daily".to_string()),
                ..input(OWNER, APPLICATION)
            })
            .await
            .unwrap_err();

        assert_eq!(err.code(), ErrorCode::Validation);
        assert_eq!(
            err.to_string(),
            "Invalid offer period. Must be one of: yearly, monthly, weekly, hourly"
        );
        assert!(fixture.offers.all().is_empty());
    }
}

mod get {
    use super::*;

    fn input(user_id: &str, application_id: &str) -> GetOffersInput {
        GetOffersInput { user_id: user_id.to_string(), application_id: application_id.to_string() }
    }

    #[tokio::test]
    async fn returns_the_applications_offers() {
        let fixture = Fixture::new(vec![
            offer("o1", APPLICATION, 100, OfferPeriod::Yearly),
            offer("other", "app-2", 100, OfferPeriod::Yearly),
        ]);

        let offers = fixture.get().execute(input(OWNER, APPLICATION)).await.unwrap();

        let ids: Vec<&str> = offers.iter().map(|offer| offer.id.as_str()).collect();
        assert_eq!(ids, vec!["o1"]);
    }

    #[tokio::test]
    async fn a_missing_application_and_someone_elses_both_read_as_not_found() {
        let fixture = Fixture::new(vec![offer("o1", APPLICATION, 100, OfferPeriod::Yearly)]);

        for (user, application_id) in [(OWNER, "missing"), (STRANGER, APPLICATION)] {
            let err = fixture.get().execute(input(user, application_id)).await.unwrap_err();
            assert_eq!(err.code(), ErrorCode::NotFound);
            assert_eq!(err.to_string(), "Application not found");
        }
    }
}

mod get_all {
    use super::*;

    async fn run(fixture: &Fixture) -> Vec<OfferWithApplication> {
        fixture.get_all().execute(GetAllOffersInput { user_id: OWNER.to_string() }).await.unwrap()
    }

    #[tokio::test]
    async fn is_empty_when_the_user_has_no_offers() {
        assert_eq!(run(&Fixture::new(vec![])).await, vec![]);
    }

    #[tokio::test]
    async fn pairs_every_offer_with_its_applications_company_and_role() {
        let first = offer("o1", "app-1", 100, OfferPeriod::Yearly);
        let second = offer("o2", "app-2", 200, OfferPeriod::Yearly);
        let fixture = Fixture::with_applications(
            vec![
                application("app-1", "Acme", "Engineer"),
                application("app-2", "Globex", "Staff Engineer"),
            ],
            vec![first.clone(), second.clone()],
        );

        assert_eq!(
            run(&fixture).await,
            vec![
                OfferWithApplication {
                    offer: first,
                    company: "Acme".to_string(),
                    role: "Engineer".to_string()
                },
                OfferWithApplication {
                    offer: second,
                    company: "Globex".to_string(),
                    role: "Staff Engineer".to_string()
                },
            ]
        );
    }

    #[tokio::test]
    async fn skips_offers_on_trashed_and_foreign_applications() {
        let fixture = Fixture::with_applications(
            vec![
                application("app-1", "Acme", "Engineer"),
                Application {
                    deleted_at: Some(at(50)),
                    ..application("app-trashed", "Gone", "Engineer")
                },
                application_owned_by("app-foreign", STRANGER),
            ],
            vec![
                offer("o1", "app-1", 100, OfferPeriod::Yearly),
                offer("o2", "app-trashed", 100, OfferPeriod::Yearly),
                offer("o3", "app-foreign", 100, OfferPeriod::Yearly),
            ],
        );

        let ids: Vec<String> =
            run(&fixture).await.into_iter().map(|entry| entry.offer.id).collect();
        assert_eq!(ids, vec!["o1"]);
    }
}

mod update {
    use super::*;

    fn input(user_id: &str, offer_id: &str) -> UpdateOfferInput {
        UpdateOfferInput {
            user_id: user_id.to_string(),
            offer_id: offer_id.to_string(),
            base_salary: Some(150_000),
            bonus: Some(Some(5_000)),
            period: Some("hourly".to_string()),
            ..Default::default()
        }
    }

    #[tokio::test]
    async fn writes_only_the_named_fields() {
        let fixture = Fixture::new(vec![offer("o1", APPLICATION, 100, OfferPeriod::Yearly)]);

        let updated = fixture.update().execute(input(OWNER, "o1")).await.unwrap();

        assert_eq!(updated.base_salary, 150_000);
        assert_eq!(updated.bonus, Some(5_000));
        assert_eq!(updated.period, OfferPeriod::Hourly);
        assert_eq!(updated.currency, "USD");
        assert_eq!(fixture.offers.all(), vec![updated]);
    }

    #[tokio::test]
    async fn fails_when_the_offer_does_not_exist() {
        let err = Fixture::new(vec![]).update().execute(input(OWNER, "missing")).await.unwrap_err();
        assert_eq!(err.code(), ErrorCode::NotFound);
        assert_eq!(err.to_string(), "Offer not found");
    }

    #[tokio::test]
    async fn refuses_an_offer_on_someone_elses_or_a_missing_application() {
        let fixture = Fixture::new(vec![
            offer("o1", APPLICATION, 100, OfferPeriod::Yearly),
            offer("orphan", "app-trashed", 100, OfferPeriod::Yearly),
        ]);

        for (user, offer_id) in [(STRANGER, "o1"), (OWNER, "orphan")] {
            let err = fixture.update().execute(input(user, offer_id)).await.unwrap_err();
            assert_eq!(err.code(), ErrorCode::Forbidden);
            assert_eq!(err.to_string(), "Not authorized");
        }
        assert_eq!(fixture.offers.all()[0].base_salary, 100);
    }

    #[tokio::test]
    async fn refuses_a_period_outside_the_known_set() {
        let fixture = Fixture::new(vec![offer("o1", APPLICATION, 100, OfferPeriod::Yearly)]);

        let err = fixture
            .update()
            .execute(UpdateOfferInput { period: Some("daily".to_string()), ..input(OWNER, "o1") })
            .await
            .unwrap_err();

        assert_eq!(err.code(), ErrorCode::Validation);
        assert_eq!(fixture.offers.all()[0].base_salary, 100);
    }
}

mod delete {
    use super::*;

    fn input(user_id: &str, offer_id: &str) -> DeleteOfferInput {
        DeleteOfferInput { user_id: user_id.to_string(), offer_id: offer_id.to_string() }
    }

    #[tokio::test]
    async fn removes_the_offer() {
        let fixture = Fixture::new(vec![offer("o1", APPLICATION, 100, OfferPeriod::Yearly)]);

        fixture.delete().execute(input(OWNER, "o1")).await.unwrap();

        assert!(fixture.offers.all().is_empty());
    }

    #[tokio::test]
    async fn fails_when_the_offer_does_not_exist() {
        let err = Fixture::new(vec![]).delete().execute(input(OWNER, "missing")).await.unwrap_err();
        assert_eq!(err.code(), ErrorCode::NotFound);
        assert_eq!(err.to_string(), "Offer not found");
    }

    #[tokio::test]
    async fn refuses_an_offer_on_someone_elses_or_a_missing_application() {
        let fixture = Fixture::new(vec![
            offer("o1", APPLICATION, 100, OfferPeriod::Yearly),
            offer("orphan", "app-trashed", 100, OfferPeriod::Yearly),
        ]);

        for (user, offer_id) in [(STRANGER, "o1"), (OWNER, "orphan")] {
            let err = fixture.delete().execute(input(user, offer_id)).await.unwrap_err();
            assert_eq!(err.code(), ErrorCode::Forbidden);
            assert_eq!(err.to_string(), "Not authorized");
        }
        assert_eq!(fixture.offers.all().len(), 2);
    }
}

mod compare {
    use super::*;

    fn input(user_id: &str, offer_ids: &[&str]) -> CompareOffersInput {
        CompareOffersInput {
            user_id: user_id.to_string(),
            offer_ids: offer_ids.iter().map(|id| id.to_string()).collect(),
        }
    }

    #[tokio::test]
    async fn normalizes_periods_and_sorts_by_total_compensation() {
        let fixture = Fixture::with_applications(
            vec![
                application("app-1", "Acme", "Engineer"),
                application("app-2", "Globex", "Staff Engineer"),
            ],
            vec![
                Offer {
                    bonus: Some(10_000),
                    ..offer("yearly", "app-1", 120_000, OfferPeriod::Yearly)
                },
                Offer {
                    bonus: Some(1_000),
                    ..offer("monthly", "app-2", 11_000, OfferPeriod::Monthly)
                },
            ],
        );

        let comparisons =
            fixture.compare().execute(input(OWNER, &["yearly", "monthly"])).await.unwrap();

        let rows: Vec<(&str, &str, &str, i64, i64)> = comparisons
            .iter()
            .map(|row| {
                (
                    row.offer.id.as_str(),
                    row.company.as_str(),
                    row.role.as_str(),
                    row.normalized_yearly_salary,
                    row.total_compensation,
                )
            })
            .collect();
        // The bonus is annualized by the offer's period, like the salary.
        assert_eq!(
            rows,
            vec![
                ("monthly", "Globex", "Staff Engineer", 132_000, 144_000),
                ("yearly", "Acme", "Engineer", 120_000, 130_000),
            ]
        );
    }

    #[tokio::test]
    async fn weekly_and_hourly_offers_are_annualized_and_ties_keep_the_order_asked_for() {
        let fixture = Fixture::new(vec![
            offer("weekly", APPLICATION, 2_000, OfferPeriod::Weekly),
            offer("hourly", APPLICATION, 50, OfferPeriod::Hourly),
        ]);

        let comparisons =
            fixture.compare().execute(input(OWNER, &["weekly", "hourly"])).await.unwrap();

        let rows: Vec<(&str, i64)> =
            comparisons.iter().map(|row| (row.offer.id.as_str(), row.total_compensation)).collect();
        assert_eq!(rows, vec![("weekly", 104_000), ("hourly", 104_000)]);
    }

    #[tokio::test]
    async fn compares_nothing_when_no_offer_is_selected() {
        let fixture = Fixture::new(vec![]);
        assert_eq!(fixture.compare().execute(input(OWNER, &[])).await.unwrap(), vec![]);
    }

    #[tokio::test]
    async fn names_the_offer_that_does_not_exist() {
        let fixture = Fixture::new(vec![offer("o1", APPLICATION, 100, OfferPeriod::Yearly)]);

        let err = fixture.compare().execute(input(OWNER, &["o1", "missing"])).await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::NotFound);
        assert_eq!(err.to_string(), "Offer missing not found");
    }

    #[tokio::test]
    async fn names_the_offer_the_user_may_not_see() {
        let fixture = Fixture::new(vec![
            offer("o1", APPLICATION, 100, OfferPeriod::Yearly),
            offer("orphan", "app-trashed", 100, OfferPeriod::Yearly),
        ]);

        for (user, offer_id) in [(STRANGER, "o1"), (OWNER, "orphan")] {
            let err = fixture.compare().execute(input(user, &[offer_id])).await.unwrap_err();
            assert_eq!(err.code(), ErrorCode::Forbidden);
            assert_eq!(err.to_string(), format!("Not authorized for offer {offer_id}"));
        }
    }
}

mod analytics {
    use super::*;

    fn priced(
        id: &str,
        application_id: &str,
        base_salary: i64,
        period: OfferPeriod,
        currency: &str,
        created_at_s: i64,
    ) -> Offer {
        Offer {
            currency: currency.to_string(),
            created_at: at(created_at_s),
            ..offer(id, application_id, base_salary, period)
        }
    }

    async fn run(fixture: &Fixture) -> OfferAnalytics {
        fixture
            .analytics()
            .execute(GetOfferAnalyticsInput { user_id: OWNER.to_string() })
            .await
            .unwrap()
    }

    #[tokio::test]
    async fn is_empty_when_there_are_no_offers() {
        let analytics = run(&Fixture::new(vec![])).await;
        assert_eq!(analytics, OfferAnalytics { trend: vec![], by_currency: vec![] });
    }

    #[tokio::test]
    async fn annualizes_each_offer_and_orders_the_trend_chronologically() {
        let fixture = Fixture::with_applications(
            vec![
                application("app-1", "Acme", "Engineer"),
                application("app-2", "Globex", "Staff Engineer"),
            ],
            vec![
                priced("offer-2", "app-2", 130_000, OfferPeriod::Yearly, "USD", 2_000),
                priced("offer-1", "app-1", 10_000, OfferPeriod::Monthly, "USD", 1_000),
            ],
        );

        let analytics = run(&fixture).await;

        assert_eq!(
            analytics.trend,
            vec![
                OfferTrendPoint {
                    offer_id: "offer-1".to_string(),
                    application_id: "app-1".to_string(),
                    company: "Acme".to_string(),
                    role: "Engineer".to_string(),
                    created_at: at(1_000),
                    currency: "USD".to_string(),
                    normalized_yearly_salary: 120_000.0,
                },
                OfferTrendPoint {
                    offer_id: "offer-2".to_string(),
                    application_id: "app-2".to_string(),
                    company: "Globex".to_string(),
                    role: "Staff Engineer".to_string(),
                    created_at: at(2_000),
                    currency: "USD".to_string(),
                    normalized_yearly_salary: 130_000.0,
                },
            ]
        );
    }

    #[tokio::test]
    async fn groups_figures_by_currency_largest_group_first() {
        let fixture = Fixture::new(vec![
            priced("eur", APPLICATION, 90_000, OfferPeriod::Yearly, "EUR", 1),
            priced("usd-1", APPLICATION, 100_000, OfferPeriod::Yearly, "USD", 2),
            priced("usd-2", APPLICATION, 150_000, OfferPeriod::Yearly, "USD", 3),
            priced("usd-3", APPLICATION, 110_000, OfferPeriod::Yearly, "USD", 4),
            priced("usd-4", APPLICATION, 121_001, OfferPeriod::Yearly, "USD", 5),
        ]);

        let analytics = run(&fixture).await;

        assert_eq!(
            analytics.by_currency,
            vec![
                CurrencyGroupStat {
                    currency: "USD".to_string(),
                    count: 4,
                    min_yearly_salary: 100_000.0,
                    max_yearly_salary: 150_000.0,
                    // The mean of the middle pair, 110 000 and 121 001.
                    median_yearly_salary: 115_500.5,
                    average_yearly_salary: 120_250.25,
                },
                CurrencyGroupStat {
                    currency: "EUR".to_string(),
                    count: 1,
                    min_yearly_salary: 90_000.0,
                    max_yearly_salary: 90_000.0,
                    median_yearly_salary: 90_000.0,
                    average_yearly_salary: 90_000.0,
                },
            ]
        );
    }

    #[tokio::test]
    async fn currencies_with_as_many_offers_keep_the_order_they_first_appear_in() {
        let fixture = Fixture::new(vec![
            priced("gbp", APPLICATION, 1, OfferPeriod::Yearly, "GBP", 30),
            priced("eur", APPLICATION, 1, OfferPeriod::Yearly, "EUR", 10),
            priced("usd", APPLICATION, 1, OfferPeriod::Yearly, "USD", 20),
        ]);

        let analytics = run(&fixture).await;

        let currencies: Vec<&str> =
            analytics.by_currency.iter().map(|stat| stat.currency.as_str()).collect();
        assert_eq!(currencies, vec!["EUR", "USD", "GBP"]);
    }

    #[tokio::test]
    async fn skips_offers_whose_application_is_not_among_the_users() {
        let fixture = Fixture::with_applications(
            vec![
                application("app-1", "Acme", "Engineer"),
                Application { deleted_at: Some(at(5)), ..application("app-trashed", "Gone", "X") },
            ],
            vec![
                priced("kept", "app-1", 100, OfferPeriod::Yearly, "USD", 1),
                priced("trashed", "app-trashed", 100, OfferPeriod::Yearly, "USD", 2),
            ],
        );

        let analytics = run(&fixture).await;

        assert_eq!(analytics.trend.len(), 1);
        assert_eq!(analytics.trend[0].offer_id, "kept");
        assert_eq!(analytics.by_currency[0].count, 1);
    }

    #[tokio::test]
    async fn annualizes_hourly_and_weekly_offers() {
        let fixture = Fixture::new(vec![
            priced("hourly", APPLICATION, 50, OfferPeriod::Hourly, "USD", 1),
            priced("weekly", APPLICATION, 2_500, OfferPeriod::Weekly, "USD", 2),
        ]);

        let analytics = run(&fixture).await;

        let salaries: Vec<f64> =
            analytics.trend.iter().map(|point| point.normalized_yearly_salary).collect();
        assert_eq!(salaries, vec![104_000.0, 130_000.0]);
        assert_eq!(analytics.by_currency[0].median_yearly_salary, 117_000.0);
    }
}
