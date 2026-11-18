import { Header } from './components/Header';
import { NotFound } from './components/ui';
import { useRoute } from './router';
import { TenderList } from './pages/TenderList';
import { NewTender } from './pages/NewTender';
import { TenderDetail } from './pages/TenderDetail';
import { BidForm } from './pages/BidForm';
import { Compare } from './pages/Compare';
import { Deal } from './pages/Deal';

function Screen() {
  const { path } = useRoute();
  const [a, id, sub] = path;
  if (!a) return <TenderList />;
  if (a === 'new' && !id) return <NewTender />;
  if (a === 'tender' && id) {
    if (!sub) return <TenderDetail id={id} />;
    if (sub === 'bid') return <BidForm id={id} />;
    if (sub === 'compare') return <Compare id={id} />;
    if (sub === 'deal') return <Deal id={id} />;
  }
  return <NotFound />;
}

export function App() {
  const { path } = useRoute();
  return (
    <>
      <Header />
      <main key={path.join('/')}>
        <Screen />
      </main>
      <footer className="footer">
        <span>TenderX MVP · демо для хакатона, кейс №19. Данные хранятся только в этом браузере (localStorage).</span>
        <span>Рыночные коридоры — иллюстративные демо-данные.</span>
      </footer>
    </>
  );
}
