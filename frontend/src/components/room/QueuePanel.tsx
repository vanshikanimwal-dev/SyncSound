import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Notice } from '@/components/ui/notice'
import { useRoomClient } from '@/features/rooms/room-client-context'
import { errorMessage } from '@/services/room-errors'
import type { Room } from '@/types/room'
import { parseYouTubeVideoId } from '@/lib/youtube'

export function QueuePanel({ room, participantId }: { room: Room; participantId: string }) {
  const { client, refresh } = useRoomClient()
  const self = room.participants.find((participant) => participant.id === participantId)
  const isHost = self?.role === 'host'
  const canEdit = isHost || room.settings.queueEditing === 'everyone'
  const [video, setVideo] = useState('')
  const [title, setTitle] = useState('')
  const [error, setError] = useState<string | null>(null)

  function addItem(event: FormEvent) {
    event.preventDefault()
    const mediaId = parseYouTubeVideoId(video)
    if (!mediaId) {
      setError('Enter a YouTube video URL or an 11-character video ID.')
      return
    }
    void run(async () => {
      await client.addQueueItem({ roomId: room.id, participantId, mediaId, title })
      setVideo('')
      setTitle('')
    })
  }

  async function run(action: () => Promise<unknown> | unknown) {
    try {
      await action()
      setError(null)
      refresh()
    } catch (caught) {
      setError(errorMessage(caught, 'Could not update the queue.'))
    }
  }

  return (
    <Card>
      <h2 className="text-lg font-semibold">Queue</h2>
      <p className="mt-1 text-sm text-muted">
        {client.mode === 'remote'
          ? 'Everyone in the room sees this queue. Titles are the text you enter, not a YouTube lookup.'
          : 'The queue is stored in this browser for now. Titles are the text you enter, not a YouTube lookup.'}
      </p>
      {canEdit ? (
        <form className="mt-4 grid gap-3" onSubmit={addItem}>
          <Field label="YouTube URL or video ID (required)" htmlFor="queue-video">
            <Input
              value={video}
              onChange={(event) => setVideo(event.target.value)}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder="https://www.youtube.com/watch?v=…"
            />
          </Field>
          <Field label="Title (optional)" htmlFor="queue-title" hint="Leave this blank to label the item as a YouTube video plus its ID.">
            <Input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} />
          </Field>
          {error ? <Notice tone="danger">{error}</Notice> : null}
          <Button type="submit">Add to queue</Button>
        </form>
      ) : (
        <Notice className="mt-4">Only the host can edit the queue in this room.</Notice>
      )}
      {room.queue.length === 0 ? (
        <p className="mt-4 text-sm text-muted">
          {canEdit ? 'The queue is empty. Add a YouTube video to get it ready.' : 'The queue is empty. The host has not added a video.'}
        </p>
      ) : (
        <ol className="mt-4 grid max-h-[50vh] gap-3 overflow-y-auto">
          {room.queue.map((item, index) => {
            const addedBy = room.participants.find((participant) => participant.id === item.addedByParticipantId)?.displayName ?? 'Former member'
            const selected = item.mediaId === room.currentMediaId
            return (
              <li key={item.id} className="rounded-md border border-line bg-elevated p-3">
                <p className="font-medium text-ink">
                  {index + 1}. {item.title}
                </p>
                <p className="text-sm text-muted">{item.mediaId}</p>
                <p className="text-sm text-muted">Added by {addedBy}</p>
                {item.error ? <p className="text-sm text-danger">{item.error}</p> : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  {isHost ? (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={selected}
                      onClick={() => void run(() => client.selectTrack(room.id, participantId, item.id))}
                    >
                      {selected ? 'Current track' : 'Set as current'}
                    </Button>
                  ) : null}
                  {canEdit ? (
                    <>
                      <Button type="button" variant="ghost" disabled={index === 0} onClick={() => void run(() => client.moveQueueItem(room.id, participantId, item.id, 'up'))}>
                        Move up
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={index === room.queue.length - 1}
                        onClick={() => void run(() => client.moveQueueItem(room.id, participantId, item.id, 'down'))}
                      >
                        Move down
                      </Button>
                      <Button type="button" variant="danger" onClick={() => void run(() => client.removeQueueItem(room.id, participantId, item.id))}>
                        Remove
                      </Button>
                    </>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </Card>
  )
}
