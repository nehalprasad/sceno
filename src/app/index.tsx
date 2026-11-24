import { Redirect } from 'expo-router';
import { useSession } from '@/lib/session';

/** App opened with no link: signed-in people with an event go home; everyone else sees Welcome. */
export default function Index() {
  const { user, celebrationId } = useSession();
  return <Redirect href={user && celebrationId ? '/home' : '/welcome'} />;
}
