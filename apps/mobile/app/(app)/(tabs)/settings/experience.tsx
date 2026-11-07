import { Redirect } from 'expo-router';

// The CV profile editor moved from Settings to the Home stack (JEF-513). The
// route stays so older links and pushes still land somewhere.
export default function LegacyExperienceRoute() {
  return <Redirect href="/profile" />;
}
