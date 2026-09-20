import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";

export default function NotFound() {
  return (
    <section className="py-28 lg:py-40">
      <Container className="text-center">
        <p className="eyebrow text-primary">404</p>
        <h1 className="display mx-auto mt-4 max-w-xl text-5xl sm:text-6xl">This page never got pitched.</h1>
        <p className="mt-5 text-ink/55">The link may be old, or the page may have moved.</p>
        <Button href="/" variant="dark" arrow className="mt-8">
          Back to home
        </Button>
      </Container>
    </section>
  );
}
