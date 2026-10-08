use crate::http::container::Container;
use crate::use_cases::push::{
    RegisterExpoPushTokenUseCase, RegisterPushSubscriptionUseCase, SendPushNotificationsUseCase,
    UnregisterPushSubscriptionUseCase,
};

impl Container {
    pub fn register_push_subscription_use_case(&self) -> RegisterPushSubscriptionUseCase {
        RegisterPushSubscriptionUseCase {
            push_subscription_repository: self.push_subscription_repository.clone(),
            generate_id: self.generate_id.clone(),
        }
    }

    pub fn register_expo_push_token_use_case(&self) -> RegisterExpoPushTokenUseCase {
        RegisterExpoPushTokenUseCase {
            push_subscription_repository: self.push_subscription_repository.clone(),
            generate_id: self.generate_id.clone(),
        }
    }

    pub fn unregister_push_subscription_use_case(&self) -> UnregisterPushSubscriptionUseCase {
        UnregisterPushSubscriptionUseCase {
            push_subscription_repository: self.push_subscription_repository.clone(),
        }
    }

    pub fn send_push_notifications_use_case(&self) -> SendPushNotificationsUseCase {
        SendPushNotificationsUseCase {
            application_repository: self.application_repository.clone(),
            interview_round_repository: self.interview_round_repository.clone(),
            user_repository: self.user_repository.clone(),
            push_subscription_repository: self.push_subscription_repository.clone(),
            logger: self.services.logger.clone(),
            web_push_service: self.services.web_push_service.clone(),
            expo_push_service: self.services.expo_push_service.clone(),
            create_notification_use_case: self.create_notification_use_case(),
        }
    }
}
