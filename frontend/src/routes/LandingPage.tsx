import { useState, type FormEvent } from 'react'
import { AudioLines, Headphones, ListMusic } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { buttonClasses } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { roomCodeError } from '@/lib/room-code'

const steps = [
  { title: 'Create a room', body: 'One person opens SyncSound and starts a listening room.' },
  { title: 'Share the code', body: 'Friends join with a code, link, or QR code on their own phones.' },
  { title: 'Press play together', body: 'The host starts a supported video. Each phone plays it locally.' },
]

const features = [
  {
    icon: Headphones,
    title: 'Separate Bluetooth devices',
    body: 'Pair headphones in your phone settings. SyncSound coordinates players; it does not connect headsets to one phone.',
  },
  {
    icon: ListMusic,
    title: 'Shared queue',
    body: 'Add YouTube videos to a queue the room can see, with host-only or shared editing.',
  },
  {
    icon: AudioLines,
    title: 'Coordinated playback',
    body: 'The goal is the same video and a close position. Phones, browsers, and Bluetooth all add delay.',
  },
]

export function LandingPage() {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)

  function continueToJoin(event: FormEvent) {
    event.preventDefault()
    const message = roomCodeError(code)
    if (message) {
      setError(message)
      return
    }
    navigate(`/join?code=${encodeURIComponent(code)}`)
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-14 px-4 py-10 sm:py-16">
      <section className="grid items-start gap-8 lg:grid-cols-[1.2fr_0.8fr]">
        <div>
          <p className="text-sm font-medium text-cyan">Separate phones. Shared song.</p>
          <h1 className="mt-3 max-w-xl text-3xl font-semibold tracking-tight sm:text-4xl">Listen together, each on your own headphones.</h1>
          <p className="mt-4 max-w-xl text-muted">
            SyncSound is for friends who each have a phone, a browser, and their own earphones. It coordinates the same supported video across those devices. Playback is as close as the devices allow. It is not sample-accurate.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link to="/create" className={buttonClasses('primary')}>
              Create a room
            </Link>
            <a href="#join" className={buttonClasses('secondary')}>
              Join with a code
            </a>
          </div>
        </div>
        <Card>
          <h2 id="join" className="text-lg font-semibold">
            Join a room
          </h2>
          <p className="mt-1 text-sm text-muted">Enter the 6-character code from the host.</p>
          <form className="mt-4 grid gap-3" onSubmit={continueToJoin}>
            <label htmlFor="landing-code" className="text-sm font-medium">
              Room code
            </label>
            <Input
              id="landing-code"
              value={code}
              onChange={(event) => {
                setCode(event.target.value)
                setError(null)
              }}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              maxLength={12}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'landing-code-error' : undefined}
              placeholder="ABC234"
            />
            {error ? (
              <p id="landing-code-error" role="alert" className="text-sm text-danger">
                {error}
              </p>
            ) : null}
            <button type="submit" className={buttonClasses('primary')}>
              Continue
            </button>
          </form>
        </Card>
      </section>

      <section id="how-it-works" className="scroll-mt-20">
        <h2 className="text-2xl font-semibold tracking-tight">How it works</h2>
        <ol className="mt-5 grid gap-4 md:grid-cols-3">
          {steps.map((step, index) => (
            <li key={step.title}>
              <Card className="h-full">
                <p className="text-sm font-medium text-cyan">Step {index + 1}</p>
                <h3 className="mt-2 text-lg font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm text-muted">{step.body}</p>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      <section id="features">
        <h2 className="text-2xl font-semibold tracking-tight">What you can do</h2>
        <ul className="mt-5 grid gap-4 md:grid-cols-3">
          {features.map((feature) => (
            <li key={feature.title}>
              <Card className="h-full">
                <feature.icon aria-hidden="true" className="size-5 text-cyan" />
                <h3 className="mt-3 text-lg font-semibold">{feature.title}</h3>
                <p className="mt-2 text-sm text-muted">{feature.body}</p>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <section id="limitations">
        <h2 className="text-2xl font-semibold tracking-tight">Compatibility and limits</h2>
        <Card className="mt-5">
          <ul className="grid gap-3 text-sm text-muted">
            <li>Works in current Android, iPhone, tablet, laptop, and desktop browsers that can play embedded YouTube video.</li>
            <li>Not every music service is supported. This version prepares YouTube rooms only.</li>
            <li>YouTube can refuse embedding for private, age-restricted, region-blocked, or disabled videos. Those cases will be explained when the player is connected.</li>
            <li>Bluetooth pairing stays in the operating system. SyncSound does not see headset names or Bluetooth addresses.</li>
            <li>Audio delay differs by device. Do not expect sample-accurate sync, especially with Bluetooth headphones.</li>
            <li>Spotify listening parties are not part of this version.</li>
            <li>Each friend joins from their own phone. Pair headphones on that phone. SyncSound does not connect multiple Bluetooth headsets to one device.</li>
          </ul>
        </Card>
      </section>
    </div>
  )
}
